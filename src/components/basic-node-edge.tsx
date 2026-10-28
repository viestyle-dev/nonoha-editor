import { Clear } from "@mui/icons-material"
import { IconButton } from "@mui/material"
import {
  EdgeProps,
  useReactFlow,
  useStore,
  Node,
  EdgeLabelRenderer,
} from "@xyflow/react"
import { useCallback, useMemo } from "react"
import { getEditorEdgeId } from "../api/editor-model-updater"
import { getNodeType } from "../stores/node-flow-store"
import { BasicPortNode } from "../nodes/engine-nodes/basic-port-node"
import { BasicEngineNode } from "../nodes/engine-nodes/basic-engine-node"
import { hexFromArgb } from "@material/material-color-utilities"
import {
  getHctFromPortValueType,
  useNodeFlowColorsStore,
} from "../stores/node-flow-colors-store"
import { useThemeStore } from "../stores/theme-store"
import { useGraphSessionStore } from "../stores/graph-session-store"
import { WAYPOINT_SIZE } from "../nodes/editor-nodes/waypoint-node"
import { buildEdgePath, edgeMidpoint, findInsertionIndex, type Point } from "../lib/graph/edge-path"

const WAYPOINT_HALF = WAYPOINT_SIZE / 2

function generateWaypointId(): string {
  return `$wp:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Helper to persist an edge's full data to the server. */
function persistEdge(
  editorModelUrl: string,
  editorEdgeId: string,
  source: string,
  sourceHandle: string | null,
  target: string,
  targetHandle: string | null,
  waypointIds: string[],
) {
  fetch(`${editorModelUrl}?query=editor_edges.${editorEdgeId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      sourceHandle,
      target,
      targetHandle,
      waypoints: waypointIds,
    }),
  })
}


export default function BasicNodeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  ...props
}: EdgeProps) {
  const { setNodes, setEdges, getNode, screenToFlowPosition, deleteElements } = useReactFlow()
  const [{ colors }] = useThemeStore()
  const isValid = (props.data as Record<string, unknown>)?.valid !== false
  const isHighlighted = (props.data as Record<string, unknown>)?.highlighted === true

  const [flowColorsState] = useNodeFlowColorsStore()
  const [{ editorModelUpdater }] = useGraphSessionStore()
  const editorModelUrl = editorModelUpdater?.editorModelUrl

  // Extract edge data
  const edgeData = props.data as Record<string, unknown> | undefined
  const rawWaypointIds = edgeData?.waypointIds as string[] | undefined
  const waypointIds = useMemo(() => rawWaypointIds ?? [], [rawWaypointIds])

  // Editor edge ID uses ":" separator (no dots) for safe JSON query paths
  const editorEdgeId = useMemo(
    () => getEditorEdgeId(props.source, props.sourceHandleId ?? null, props.target, props.targetHandleId ?? null),
    [props.source, props.sourceHandleId, props.target, props.targetHandleId],
  )

  const [sourceColor, targetColor] = useMemo(() => {
    const sourceNode = getNode(props.source)
    const targetNode = getNode(props.target)

    const getValues = (
      node: Node | undefined,
      sourceHandleId: string | undefined | null,
      targetHandleId: string | undefined | null
    ) => {
      if (!node) {
        return undefined
      }
      switch (getNodeType(node.id)) {
        case "input":
        case "output": {
          const nodeData = node.data as BasicPortNode["data"]
          return nodeData.port.values
        }
        case "editor": {
          return undefined
        }
        case "node": {
          const nodeData = node.data as BasicEngineNode["data"]
          if (sourceHandleId) {
            return nodeData.nodeData.outputs.find(
              output => output.name === sourceHandleId
            )?.values
          }
          if (targetHandleId) {
            return nodeData.nodeData.inputs.find(
              input => input.name === targetHandleId
            )?.values
          }
          return undefined
        }
      }
    }
    const sourceValues = getValues(sourceNode, props.sourceHandleId, undefined)
    const targetValues = getValues(targetNode, undefined, props.targetHandleId)

    const sourceType = sourceValues?.[0]?.type
    const targetType = targetValues?.[0]?.type
    const sourceColor =
      sourceType &&
      hexFromArgb(
        getHctFromPortValueType(sourceType, flowColorsState.pallet).toInt()
      )
    const targetColor =
      targetType &&
      hexFromArgb(
        getHctFromPortValueType(targetType, flowColorsState.pallet).toInt()
      )
    if (sourceColor && targetColor) {
      return [sourceColor, targetColor]
    }
    if (sourceColor && !targetColor) {
      return [sourceColor, sourceColor]
    }
    if (!sourceColor && targetColor) {
      return [targetColor, targetColor]
    }
    return [undefined, undefined]
  }, [getNode, props.source, props.target, props.sourceHandleId, props.targetHandleId, flowColorsState.pallet])

  // Resolve waypoints from React Flow store (reactive to position changes)
  const resolvedWaypoints = useStore(
    useCallback(
      (state) => {
        if (waypointIds.length === 0) return []
        const result: Point[] = []
        for (const wpId of waypointIds) {
          const wpNode = state.nodeLookup.get(wpId)
          if (wpNode) {
            // Use positionAbsolute + half size to center edge on waypoint
            const pos = wpNode.internals.positionAbsolute
            result.push({ x: pos.x + WAYPOINT_HALF, y: pos.y + WAYPOINT_HALF })
          }
        }
        return result
      },
      [waypointIds],
    ),
  )

  const edgePath = useMemo(() => {
    const source: Point = { x: sourceX, y: sourceY }
    const target: Point = { x: targetX, y: targetY }
    return buildEdgePath(source, target, resolvedWaypoints)
  }, [sourceX, sourceY, targetX, targetY, resolvedWaypoints])

  // Label at the midpoint of the actual edge path (waypoint-aware)
  const { x: labelX, y: labelY } = useMemo(() => {
    const source: Point = { x: sourceX, y: sourceY }
    const target: Point = { x: targetX, y: targetY }
    return edgeMidpoint(source, target, resolvedWaypoints)
  }, [sourceX, sourceY, targetX, targetY, resolvedWaypoints])

  const handleEdgeDelete = () => {
    deleteElements({ edges: [{ id }] })
  }

  // --- Waypoint: add on double-click ---
  const handleEdgeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!editorModelUrl) return
      e.stopPropagation()

      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const wpId = generateWaypointId()
      const source: Point = { x: sourceX, y: sourceY }
      const target: Point = { x: targetX, y: targetY }
      const insertIdx = findInsertionIndex(
        flowPos.x, flowPos.y, source, target, resolvedWaypoints,
      )

      const newWaypointIds = [...waypointIds]
      newWaypointIds.splice(insertIdx, 0, wpId)

      // Convert absolute flow position to $graph-relative position
      const graphNode = getNode("$graph")
      const graphOffset = graphNode?.position ?? { x: 0, y: 0 }
      const relativePos = {
        x: flowPos.x - graphOffset.x,
        y: flowPos.y - graphOffset.y,
      }

      // Add waypoint as a React Flow node
      setNodes(nodes => [
        ...nodes,
        {
          id: wpId,
          type: "WaypointNode",
          position: relativePos,
          parentId: "$graph",
          data: {},
          zIndex: 2000,
        },
      ])

      // Update this edge's waypointIds
      setEdges(edges =>
        edges.map(edge =>
          edge.id === id
            ? { ...edge, data: { ...edge.data, waypointIds: newWaypointIds } }
            : edge,
        ),
      )

      // Persist waypoint node (relative to $graph)
      fetch(`${editorModelUrl}?query=nodes.${wpId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WaypointNode", x: relativePos.x, y: relativePos.y }),
      })
      // Persist edge
      persistEdge(
        editorModelUrl, editorEdgeId,
        props.source, props.sourceHandleId ?? null,
        props.target, props.targetHandleId ?? null,
        newWaypointIds,
      )
    },
    [
      editorModelUrl, editorEdgeId, id, props.source, props.target,
      props.sourceHandleId, props.targetHandleId,
      sourceX, sourceY, targetX, targetY,
      waypointIds, resolvedWaypoints, getNode, setNodes, setEdges, screenToFlowPosition,
    ],
  )

  return (
    <>
      <defs>
        <linearGradient
          id={`gradient-${id}`}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop
            offset="0%"
            stopColor={
              props.selected
                ? colors.tertiary
                : isValid
                  ? sourceColor
                  : colors.error
            }
          />
          <stop
            offset="100%"
            stopColor={
              props.selected
                ? colors.tertiary
                : isValid
                  ? targetColor
                  : colors.error
            }
          />
        </linearGradient>
      </defs>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={isHighlighted ? colors.tertiary : `url(#gradient-${id})`}
        strokeWidth={isHighlighted ? 5 : isValid ? 4 : 3}
        strokeDasharray={isValid ? undefined : "8 4"}
        opacity={1.0}
        onDoubleClick={handleEdgeDoubleClick}
      />
      {/* Wider invisible path for easier double-click targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onDoubleClick={handleEdgeDoubleClick}
      />
      {props.selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
          >
            <IconButton size="small" onClick={handleEdgeDelete}>
              <Clear />
            </IconButton>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
