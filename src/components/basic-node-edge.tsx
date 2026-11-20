import { Clear, Link, LinkOff, Output, VisibilityOutlined, WarningAmber } from "@mui/icons-material"
import { IconButton, Paper, Tooltip } from "@mui/material"
import {
  ConnectionLineComponentProps,
  EdgeProps,
  Position,
  ReactFlowState,
  useReactFlow,
  useStore,
  useStoreApi,
  Node,
} from "@xyflow/react"
import { MouseEvent, useCallback, useMemo } from "react"
import { getEditorEdgeId } from "../api/editor-model-updater"
import { getNodeType } from "../stores/node-flow-store"
import { BasicPortNode } from "../nodes/engine-nodes/basic-port-node"
import { BasicEngineNode } from "../nodes/engine-nodes/basic-engine-node"
import { useNodeFlowColorsStore } from "../stores/node-flow-colors-store"
import { edgeColors } from "../lib/graph/port-colors"
import { useThemeStore } from "../stores/theme-store"
import { useGraphSessionStore } from "../stores/graph-session-store"
import { generateWaypointId, waypointNode } from "../nodes/editor-nodes/waypoint-node"
import {
  buildEdgePath,
  edgeMidpoint,
  findInsertionIndex,
  samePoints,
  waypointCenter,
  type Point,
} from "../lib/graph/edge-path"
import { edgeWeight } from "../lib/graph/edge-weight"
import { snapWaypointCenter } from "../lib/graph/grid"
import { edgeDrawings, type DrawAs } from "../lib/graph/edge-drawing"
import { drawAsOf, EdgeLabelPortal, useEdgeDrawing, useOutputMarks } from "../hooks/use-edge-drawing"
import {
  sourceActivityRef,
  useInspector,
  useInspectorObserving,
  usePortFlowing,
  usePortProblem,
} from "../inspector/inspector-store"

const NO_POINTS: Point[] = []
/** Hidden until the edge's nodes are selected (EdgeFocus shows it): references and displays. */
export const HIDDEN_EDGE_CLASS = "edge-hidden"
/** An edge whose source port stopped recedes (selected or highlighted, it shows in full). */
const OPACITY_STOPPED = 0.5

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
  const { setNodes, setEdges, getNode, screenToFlowPosition, deleteElements, setCenter, getZoom } = useReactFlow()
  const store = useStoreApi()
  const [{ colors }] = useThemeStore()
  const isValid = (props.data as Record<string, unknown>)?.valid !== false
  const isHighlighted = (props.data as Record<string, unknown>)?.highlighted === true
  // Engine node output -> display node: fed by the inspector (sampled), drawn dashed.
  const endpoints = props.data as { source?: { type: string }; target?: { type: string } } | undefined
  const isMonitor = endpoints?.source?.type === "node" && endpoints?.target?.type === "editor"

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

  // The ports' declared types (static: they change only when the graph does)
  const [sourceType, targetType] = useMemo(() => {
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
    return [sourceValues?.[0]?.type, targetValues?.[0]?.type] as const
  }, [getNode, props.source, props.target, props.sourceHandleId, props.targetHandleId])
  const colorsAlong = useMemo(
    () => edgeColors(sourceType, targetType, flowColorsState.pallet),
    [sourceType, targetType, flowColorsState.pallet],
  )
  const gradient = colorsAlong !== null && colorsAlong[0] !== colorsAlong[1]

  // Whether values flow along it now (the inspector's activity of the source port)
  const observing = useInspectorObserving()
  const flowRef = useMemo(
    () => (observing ? sourceActivityRef(props.source, props.sourceHandleId) : null),
    [observing, props.source, props.sourceHandleId],
  )
  const flowing = usePortFlowing(flowRef)
  const stopped = flowRef !== null && !flowing

  // Drawn as a line, or as a reference / display (tags at the ends; the line
  // only while its nodes are selected). See edge-drawing.ts.
  const drawing = useEdgeDrawing(id)
  const drawnAsLine = drawing === "line"
  const outputMarks = useOutputMarks(id, props.source, props.sourceHandleId)
  const sourceName = useMemo(() => {
    if (props.source.startsWith("$input:") || props.source.startsWith("$output:")) {
      return props.source.slice(props.source.indexOf(":") + 1)
    }
    const label = (getNode(props.source)?.data as { label?: string } | undefined)?.label ?? props.source
    return props.sourceHandleId ? `${label}.${props.sourceHandleId}` : label
  }, [getNode, props.source, props.sourceHandleId])

  /**
   * Select the source node (its references show), and with `center` go to it.
   * A node that cannot be selected (a port of a read-only graph) stays so:
   * selecting it would offer what a selection offers, its delete button.
   */
  const selectSource = useCallback(
    (event: MouseEvent, center: boolean) => {
      event.stopPropagation()
      setNodes(nodes =>
        nodes.map(node => {
          const selected = node.id === props.source && node.selectable !== false
          return Boolean(node.selected) === selected ? node : { ...node, selected }
        }),
      )
      setEdges(edges => edges.map(edge => (edge.selected ? { ...edge, selected: false } : edge)))
      if (center) setCenter(sourceX, sourceY, { zoom: getZoom(), duration: 300 })
    },
    [props.source, setNodes, setEdges, setCenter, getZoom, sourceX, sourceY],
  )

  /** Draw the source output's data edges as `next`; equal to the rule, the override is dropped. */
  const setOutputDrawing = useCallback(
    (next: DrawAs) => {
      const state = store.getState()
      const handle = props.sourceHandleId ?? ""
      const others = drawAsOf(state)
      const rule = edgeDrawings(state.edges, (source, sourceHandle) =>
        source === props.source && (sourceHandle ?? "") === handle ? undefined : others(source, sourceHandle),
      ).of.get(id)
      const current = (state.nodeLookup.get(props.source)?.data as { drawAs?: Record<string, DrawAs> } | undefined)?.drawAs
      const updated: Record<string, DrawAs> = { ...current }
      if (next === rule) delete updated[handle]
      else updated[handle] = next
      const drawAs = Object.keys(updated).length > 0 ? updated : undefined
      setNodes(nodes => nodes.map(node => (node.id === props.source ? { ...node, data: { ...node.data, drawAs } } : node)))
      editorModelUpdater?.setNodeDrawAs(props.source, drawAs ?? null)
    },
    [store, id, props.source, props.sourceHandleId, setNodes, editorModelUpdater],
  )

  // Waypoints from the React Flow store: re-renders only when one of them moves.
  // The selector runs on every pan frame; it does nothing while the nodes are the same.
  const resolvedWaypoints = useStore(
    useMemo(() => {
      let nodes: unknown = null
      let points: Point[] = NO_POINTS
      return (state: ReactFlowState) => {
        if (waypointIds.length === 0 || state.nodes === nodes) return points
        nodes = state.nodes
        const result: Point[] = []
        for (const wpId of waypointIds) {
          const wpNode = state.nodeLookup.get(wpId)
          if (wpNode) result.push(waypointCenter(wpNode.internals.positionAbsolute))
        }
        if (!samePoints(result, points)) points = result
        return points
      }
    }, [waypointIds]),
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

  // Dashed (inspector) edge -> route it through a new $output port instead.
  const inspector = useInspector()
  // Why the sampled values do not arrive (too large to show, the port gone, a refused watch)
  const problem = usePortProblem(
    isMonitor && props.sourceHandleId ? { node: props.source, dir: "out", port: props.sourceHandleId } : null,
  )
  const handlePromote = () => {
    inspector?.promoteHandler?.({
      source: props.source,
      sourceHandle: props.sourceHandleId ?? null,
      target: props.target,
      targetHandle: props.targetHandleId ?? null,
    })
  }

  // --- Waypoint: add on double-click ---
  const handleEdgeDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!editorModelUrl) return
      e.stopPropagation()

      // Where it was clicked, on the grid as a drag would leave it
      const flowPos = snapWaypointCenter(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
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

      // Add a waypoint centered where the edge was clicked
      setNodes(nodes => [...nodes, waypointNode(wpId, relativePos)])

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

  const weight = edgeWeight(sourceType ?? targetType)
  const stroke = props.selected || isHighlighted
    ? colors.tertiary
    : !isValid
      ? colors.error
      : colorsAlong === null
        ? colors.outline
        : gradient
          ? `url(#gradient-${id})`
          : colorsAlong[0]

  return (
    <>
      {gradient && (
        <defs>
          <linearGradient id={`gradient-${id}`} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
            <stop offset="0%" stopColor={colorsAlong[0]} />
            <stop offset="100%" stopColor={colorsAlong[1]} />
          </linearGradient>
        </defs>
      )}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={isHighlighted ? weight + 1.5 : isMonitor ? Math.min(weight, 3) : weight}
        strokeDasharray={!isValid ? "8 4" : isMonitor ? "1 7" : drawnAsLine ? undefined : "6 6"}
        strokeLinecap={isMonitor ? "round" : undefined}
        opacity={stopped && !props.selected && !isHighlighted ? OPACITY_STOPPED : 1}
        style={{ transition: "opacity 0.3s" }}
        className={drawnAsLine ? undefined : HIDDEN_EDGE_CLASS}
        onDoubleClick={handleEdgeDoubleClick}
      />
      {/* Wider invisible path for easier double-click targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className={drawnAsLine ? undefined : HIDDEN_EDGE_CLASS}
        onDoubleClick={handleEdgeDoubleClick}
      />
      {!drawnAsLine && (
        <EdgeLabelPortal>
          {/* The source's name at the target's input, with a stub of the line */}
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-100%, -50%) translate(${targetX - 6}px,${targetY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Tooltip title={problem ?? `${drawing === "display" ? "Shows" : "From"} ${sourceName} (click to go there)`} placement="top">
              <button
                type="button"
                onClick={event => selectSource(event, true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  maxWidth: 160,
                  padding: "0 6px",
                  font: "inherit",
                  fontSize: 10,
                  lineHeight: "16px",
                  color: problem ? colors.error : colors.onSurface,
                  background: colors.surfaceContainerHigh,
                  border: `1px solid ${problem ? colors.error : (colorsAlong?.[0] ?? colors.outline)}`,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {problem && <WarningAmber style={{ fontSize: 12 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sourceName}</span>
              </button>
            </Tooltip>
            <span style={{ width: 6, height: 2, background: colorsAlong?.[1] ?? colors.outline }} />
          </div>
        </EdgeLabelPortal>
      )}
      {outputMarks && <OutputMarks
        marks={outputMarks}
        x={sourceX}
        y={sourceY}
        color={colorsAlong?.[0] ?? colors.outline}
        onClick={event => selectSource(event, false)}
      />}
      {problem && drawnAsLine && !props.selected && (
        <EdgeLabelPortal>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
          >
            <Tooltip title={problem}>
              <WarningAmber
                fontSize="small"
                aria-label={problem}
                style={{ display: "block", color: colors.error, background: colors.surfaceContainerHigh, borderRadius: 10, padding: 2 }}
              />
            </Tooltip>
          </div>
        </EdgeLabelPortal>
      )}
      {props.selected && (
        <EdgeLabelPortal>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
          >
            <Paper elevation={2} style={{ display: "flex", borderRadius: 16, background: colors.surfaceContainerHigh }}>
              {problem && (
                <Tooltip title={problem}>
                  <WarningAmber fontSize="small" aria-label={problem} style={{ color: colors.error, margin: 5 }} />
                </Tooltip>
              )}
              {drawing !== "display" && (
                <Tooltip
                  title={
                    drawnAsLine
                      ? "Draw this output as references: name tags at both ends, the lines only while selected"
                      : "Draw this output as lines"
                  }
                >
                  <IconButton
                    size="small"
                    onClick={() => setOutputDrawing(drawnAsLine ? "reference" : "line")}
                    aria-label={drawnAsLine ? "Draw as references" : "Draw as lines"}
                  >
                    {drawnAsLine ? <LinkOff fontSize="small" /> : <Link fontSize="small" />}
                  </IconButton>
                </Tooltip>
              )}
              {isMonitor && inspector?.promoteHandler && (
                <Tooltip title="Make output port: every value, also available to apps">
                  <IconButton size="small" onClick={handlePromote} aria-label="Make output port">
                    <Output fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <IconButton size="small" onClick={handleEdgeDelete} aria-label="Delete edge">
                <Clear fontSize="small" />
              </IconButton>
            </Paper>
          </div>
        </EdgeLabelPortal>
      )}
    </>
  )
}

/**
 * At an output whose edges are references or displays: how many go where
 * (the tag-shaped count for references, the eye for displays). Clicking it
 * selects the node, which shows them.
 */
function OutputMarks({
  marks,
  x,
  y,
  color,
  onClick,
}: {
  marks: string
  x: number
  y: number
  color: string
  onClick: (event: MouseEvent) => void
}) {
  const [{ colors }] = useThemeStore()
  const [references, displays] = marks.split("|").map(Number)
  const pill = {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: "0 5px",
    fontSize: 10,
    lineHeight: "14px",
    borderRadius: 7,
    background: colors.surfaceContainerHigh,
    fontVariantNumeric: "tabular-nums",
  } as const
  return (
    <EdgeLabelPortal>
      <div
        className="nodrag nopan"
        onClick={onClick}
        style={{
          position: "absolute",
          transform: `translate(0, -50%) translate(${x + 10}px,${y}px)`,
          pointerEvents: "all",
          zIndex: 1000,
          display: "flex",
          gap: 3,
          cursor: "pointer",
        }}
      >
        {references > 0 && (
          <Tooltip title={`Also used at ${references} input${references > 1 ? "s" : ""} (shown by name there; select to see the lines)`}>
            <span style={{ ...pill, color: colors.onSurface, border: `1px solid ${color}` }}>→ {references}</span>
          </Tooltip>
        )}
        {displays > 0 && (
          <Tooltip title={`Shown by ${displays} display${displays > 1 ? "s" : ""}`}>
            <span style={{ ...pill, color: colors.onSurfaceVariant, border: `1px solid ${colors.outlineVariant}` }}>
              <VisibilityOutlined style={{ fontSize: 11 }} />
              {displays}
            </span>
          </Tooltip>
        )}
      </div>
    </EdgeLabelPortal>
  )
}

/**
 * The line drawn while a connection is dragged: the same curve as an edge
 * (from the output side), so it keeps its shape when dropped.
 */
export function EdgeConnectionLine({ fromX, fromY, toX, toY, fromPosition }: ConnectionLineComponentProps) {
  const from = { x: fromX, y: fromY }
  const to = { x: toX, y: toY }
  const d = fromPosition === Position.Left ? buildEdgePath(to, from, NO_POINTS) : buildEdgePath(from, to, NO_POINTS)
  return <path className="react-flow__connection-path" d={d} fill="none" />
}
