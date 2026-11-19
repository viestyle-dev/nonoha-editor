"use client"

import { useRouterStore } from "@/src/stores/router-store"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { css } from "@emotion/react"
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Background,
  NodeChange,
  applyNodeChanges,
  Edge,
  Controls,
  EdgeChange,
  Connection,
  BackgroundVariant,
  ViewportPortal,
  SelectionMode,
  applyEdgeChanges,
  ReactFlowProvider,
  MiniMap,
  ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Button,
  Fab,
  IconButton,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material"
import {
  Add,
  Close,
  CloseSharp,
  DarkMode,
  FolderOpen,
  Height,
  LightMode,
  MoreVert,
  Refresh,
  Search,
} from "@mui/icons-material"
import { PortDataType, GraphEndpoint } from "nonoha-client-js"
import {
  getEditorEdgeId,
  type EditorModelUpdater,
} from "@/src/api/editor-model-updater"
import { useEngineGatewayStateStore } from "../../src/stores/engine-gateway-store"

import "./page.css"
import {
  BasicEdge,
  createNodeRegistry,
  EDGE_TYPES,
  getEngineNodeUIType,
  getEngineNodeVariant,
  getNodeType,
  makeEditorNode,
  graphAddEdge,
  NODE_TYPES,
  NodeRegistry,
} from "@/src/stores/node-flow-store"
import NodeAddMenu, { NodePrototype } from "@/src/components/node-add-menu"
import { PortAddDialog } from "@/src/components/node-add-menu/index"
import type { BasicEngineNode } from "@/src/nodes/engine-nodes/basic-engine-node"
import { NodeCatalogProvider } from "@/src/stores/node-catalog-store"
import {
  generateEditorNodeId,
  generateUniqueSuffix,
} from "@/src/lib/id-generator"
import { useThemeStore } from "@/src/stores/theme-store"
import { closeSnackbar, enqueueSnackbar, SnackbarKey } from "notistack"
import { OriginMarker } from "@/src/components/origin-marker"
import { EngineGatewaySettingsDialog } from "@/src/components/engine-gateway-settings-dialog"
import { DataBrowserDrawer } from "@/src/components/data-browser"
import { NodeSearchDialog } from "@/src/components/node-search-dialog"
import { useRouter } from "next/navigation"
import { SnackbarActionClose } from "@/src/components/snackbar-actions"
import { ProgressIndicator } from "@/src/components/progress-indicator"
import { EdgeDropContextMenu } from "@/src/components/edge-drop-context-menu"
import type {
  ClipboardNodeData,
  ClipboardEdgeData,
  ClipboardData,
  CreateNodeRequestData,
  NodeDataStructure,
  CreatedNodeResponse,
} from "./types"
import { makeNodePrototypes } from "./node-prototypes"
import { buildGraph, refreshGraph } from "./graph-loader"
import { generateWaypointId, waypointNode } from "@/src/nodes/editor-nodes/waypoint-node"
import { EDGE_Z_INDEX } from "@/src/api/graph-api"
import { EdgeConnectionLine } from "@/src/components/basic-node-edge"
import { BreathPauser } from "@/src/components/breath"
import { EdgeFocus } from "@/src/components/edge-focus"
import { EdgeDrawingsProvider } from "@/src/hooks/use-edge-drawing"
import {
  parseEdgeEndpoint,
  WAYPOINT_MERGE_RADIUS,
  cleanupWaypointFromEdges,
  handleEdgesDelete,
  handleNodesDelete,
} from "./edge-handlers"
import {
  filterWaypointsInSelection,
  mapClipboardWaypoints,
  stripPasteSuffix,
} from "./clipboard-handlers"
import {
  GraphSessionStoreProvider,
  useGraphSessionStore,
} from "@/src/stores/graph-session-store"
import {
  InspectorProvider,
  useInspector,
  useInspectorLive,
  type EdgeEndpoints,
  type PinRequest,
} from "@/src/inspector/inspector-store"
import { InspectorStatusButton } from "@/src/inspector/inspector-status-button"
import { EngineAboutControls } from "@/src/components/engine-about"
import { EnvSettingsDialog, EnvSettingsMenuItem } from "@/src/components/env-settings-dialog"
import { ViewCatalogProvider, useViewCatalog } from "@/src/views/view-catalog"
import { builtinViews, type DefinedView } from "nonoha-views"
import { EDITOR_NODE_SPEC_BY_TYPE } from "@/src/editor-nodes/specs"
import { findFreeSpot, rectsOverlap, type Rect } from "@/src/lib/graph/free-spot"
import type { ValueKind } from "@/src/inspector/interpret"

const GRAPH_EDIT_DISABLED =
  process.env.NEXT_PUBLIC_GRAPH_EDIT_DISABLED == "true"

/** Built-in views of nonoha-views ("builtin/<id>" in the view catalog). */
const BUILTIN_VIEWS: readonly DefinedView[] = builtinViews

/** Add-menu entries for the views in the catalog (one PluginViewNode prototype each). */
function ViewPrototypesBridge({
  graphEndpoint,
  editorModelUpdater,
  onChange,
  catalogRef,
}: {
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater | undefined
  onChange: (prototypes: NodePrototype[]) => void
  catalogRef: { current: ReadonlyMap<string, { title: string; size?: { width: number; height: number } }> }
}) {
  const catalog = useViewCatalog()
  catalogRef.current = catalog.entries
  useEffect(() => {
    if (!graphEndpoint || !editorModelUpdater) return
    const prototypes: NodePrototype[] = []
    catalog.entries.forEach(entry => {
      prototypes.push({
        id: "$editor:PluginViewNode",
        type: "PluginViewNode",
        data: {
          label: entry.title,
          nodeData: { view: entry.key, settings: {} },
          graphEndpoint,
          editorModelUpdater,
        } as NodePrototype["data"],
        style: entry.size ?? { width: 420, height: 320 },
        catalog: {
          key: `view:${entry.key}`,
          label: entry.title,
          category: "Views",
          description: `${entry.description}${entry.source === "plugin" ? ` (${entry.pluginId})` : " (built-in)"}`,
          inputs: entry.inputs.map(i => ({ name: i.name, types: [], accepts: i.accepts, description: i.description ?? "" })),
        },
      })
    })
    onChange(prototypes)
  }, [catalog, graphEndpoint, editorModelUpdater, onChange])
  return null
}

/** Display node (and its input handle) created when a peeked port is pinned. */
const PIN_TARGETS: Partial<Record<ValueKind, { type: string; handle: string }>> = {
  image: { type: "ImageDisplayNode", handle: "image" },
  bytes: { type: "ImageDisplayNode", handle: "image" },
  scalar: { type: "FastTimeSeriesGraphNode", handle: "series" },
  vector: { type: "FastLineChartGraphNode", handle: "traces" },
  series: { type: "FastTimeSeriesGraphNode", handle: "series" }, // every item, as a time series
}

/**
 * Connects the graph page to the inspector context (the page renders the
 * provider itself, so it cannot read the context directly): registers the
 * pin handler and mirrors whether dashed connections are available.
 */
function InspectorBridge({
  onPin,
  onPromote,
  availableRef,
}: {
  onPin: (request: PinRequest) => void
  onPromote: (edge: EdgeEndpoints) => void
  availableRef: { current: boolean }
}) {
  const inspector = useInspector()
  availableRef.current = useInspectorLive()
  useEffect(() => {
    if (!inspector) return
    inspector.pinHandler = onPin
    inspector.promoteHandler = onPromote
    return () => {
      if (inspector.pinHandler === onPin) inspector.pinHandler = null
      if (inspector.promoteHandler === onPromote) inspector.promoteHandler = null
    }
  }, [inspector, onPin, onPromote])
  return null
}

const NO_NODES: Node[] = []

/** The port names of `prefix` ("$input:" or "$output:") nodes, joined with newlines. */
function portNamesKey(nodes: Node[], prefix: string): string {
  let key = ""
  for (const node of nodes) {
    if (node.id.startsWith(prefix)) key += `${node.id.slice(prefix.length)}\n`
  }
  return key
}

function splitPortNames(key: string): string[] {
  return key ? key.slice(0, -1).split("\n") : []
}

export default function Page() {
  return (
    <GraphSessionStoreProvider>
      <PageInner />
    </GraphSessionStoreProvider>
  )
}

function PageInner() {
  // console.log(process.env.NEXT_PUBLIC_GRAPH_EDIT_DISABLED)
  const [themeState, themeStoreActions] = useThemeStore()

  // Progress indicator state
  const [progressState, setProgressState] = useState<{
    isActive: boolean
    current: number
    total: number
    message?: string
    startTime: number
  }>({
    isActive: false,
    current: 0,
    total: 0,
    message: undefined,
    startTime: 0,
  })
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)

  const [routerState, routerActions] = useRouterStore()

  const [nodeAddDialogOpen, setNodeAddDialogOpen] = useState(false)

  const [nodes, setNodes] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])

  const nodeRegistryRef = useRef(createNodeRegistry())
  const refGraphEndpoint = useRef<GraphEndpoint | undefined>()

  const editorModelUpdaterRef = useRef<EditorModelUpdater | undefined>()
  const [, graphSessionActions] = useGraphSessionStore()

  const [nodePrototypes, setNodePrototypes] = useState<NodePrototype[]>([])
  const [viewPrototypes, setViewPrototypes] = useState<NodePrototype[]>([])
  const allNodePrototypes = useMemo(
    () => (viewPrototypes.length ? nodePrototypes.concat(viewPrototypes) : nodePrototypes),
    [nodePrototypes, viewPrototypes],
  )

  const engineGatewayUrlRef = useRef<string | undefined>()
  const [connectedEngineUrl, setConnectedEngineUrl] = useState<
    string | undefined
  >()

  // Edge-drop context menu state
  const connectStartRef = useRef<{
    nodeId: string
    handleId: string | null
    handleType: "source" | "target"
  } | null>(null)
  const [edgeDropMenuState, setEdgeDropMenuState] = useState<{
    screenPosition: { x: number; y: number }
    flowPosition: { x: number; y: number }
    sourceNodeId: string
    sourceHandleId: string | null
    sourceHandleType: "source" | "target"
  } | null>(null)
  const edgeDropMenuStateRef = useRef(edgeDropMenuState)
  edgeDropMenuStateRef.current = edgeDropMenuState

  // The graph's port names, as new arrays only when the names change (not
  // on every node move: the dialogs that take them would re-render)
  const inputPortNamesKey = useMemo(() => portNamesKey(nodes, "$input:"), [nodes])
  const outputPortNamesKey = useMemo(() => portNamesKey(nodes, "$output:"), [nodes])
  const existingInputPortNames = useMemo(() => splitPortNames(inputPortNamesKey), [inputPortNamesKey])
  const existingOutputPortNames = useMemo(() => splitPortNames(outputPortNamesKey), [outputPortNamesKey])

  // Reads the nodes when a waypoint is dropped (not from render): the change
  // handler stays the same function through a drag, and React Flow's store is
  // not updated again with a new onNodesChange on every drag update.
  const handleWaypointMerge = useCallback(
    (draggedWpId: string, draggedPos: { x: number; y: number }) => {
      // Find nearby waypoint to merge with
      let nearestId: string | null = null
      let nearestDist = Infinity
      for (const node of reactFlowInstanceRef.current?.getNodes() ?? []) {
        if (!node.id.startsWith("$wp:") || node.id === draggedWpId) continue
        const dx = node.position.x - draggedPos.x
        const dy = node.position.y - draggedPos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < WAYPOINT_MERGE_RADIUS && dist < nearestDist) {
          nearestDist = dist
          nearestId = node.id
        }
      }

      if (!nearestId) return
      const targetId = nearestId

      // Replace all references to draggedWpId with targetId in edges
      // Collect affected edges for persistence
      const affectedEdges: Array<{
        editorEdgeId: string
        source: string
        sourceHandle: string | null
        target: string
        targetHandle: string | null
        newWaypointIds: string[]
      }> = []

      setEdges(edges =>
        edges.map(edge => {
          const wpIds = (edge.data as Record<string, unknown>)?.waypointIds as
            | string[]
            | undefined
          if (!wpIds?.includes(draggedWpId)) return edge
          const newWpIds = wpIds.map(id => (id === draggedWpId ? targetId : id))
          affectedEdges.push({
            editorEdgeId: getEditorEdgeId(
              edge.source,
              edge.sourceHandle ?? null,
              edge.target,
              edge.targetHandle ?? null,
            ),
            source: edge.source,
            sourceHandle: edge.sourceHandle ?? null,
            target: edge.target,
            targetHandle: edge.targetHandle ?? null,
            newWaypointIds: newWpIds,
          })
          return {
            ...edge,
            data: { ...edge.data, waypointIds: newWpIds },
          }
        }),
      )

      // Remove the merged waypoint node
      setNodes(nodes => nodes.filter(n => n.id !== draggedWpId))

      // Persist
      const editorModelUpdater = editorModelUpdaterRef.current
      if (editorModelUpdater) {
        editorModelUpdater.removeNode(draggedWpId)
        for (const ae of affectedEdges) {
          fetch(
            `${editorModelUpdater.editorModelUrl}?query=editor_edges.${ae.editorEdgeId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: ae.source,
                sourceHandle: ae.sourceHandle,
                target: ae.target,
                targetHandle: ae.targetHandle,
                waypoints: ae.newWaypointIds,
              }),
            },
          )
        }
      }
    },
    [setEdges, setNodes],
  )

  const onNodeChange = useCallback(
    (changes: NodeChange[]) => {
      // Deletion side effects are handled by onNodesDelete (React Flow fires
      // it via deleteElements before triggerNodeChanges). Here we only react
      // to position changes (waypoint merge + persistence) and let React Flow
      // apply the changes to local state.
      changes.forEach(change => {
        if (change.type == "position") {
          if (change.dragging) {
            return
          }
          if (change.position === undefined) {
            return
          }
          editorModelUpdaterRef.current?.updateNodePosition(
            change.id,
            change.position.x,
            change.position.y,
          )

          // Waypoint merge: if dropped near another waypoint, merge them
          if (change.id.startsWith("$wp:")) {
            handleWaypointMerge(change.id, change.position)
          }
        }
      })

      setNodes(nds => applyNodeChanges(changes, nds))
    },
    [setNodes, handleWaypointMerge],
  )

  const inspectorAvailableRef = useRef(false)

  // An editor (display) input takes one connection: a new one replaces it.
  // sourceType "output": solid edge from a $output port node.
  // sourceType "node": dashed edge from an engine node output (inspector).
  const connectEditorInput = useCallback(
    (connection: Connection, sourceType: "output" | "node") => {
      const updater = editorModelUpdaterRef.current
      const edgeId = getEditorEdgeId(
        connection.source,
        connection.sourceHandle,
        connection.target,
        connection.targetHandle,
      )
      const current = reactFlowInstanceRef.current?.getEdges() ?? []
      const replaced = current.filter(
        e =>
          e.target === connection.target &&
          (e.targetHandle ?? null) === (connection.targetHandle ?? null) &&
          e.id !== edgeId,
      )
      for (const edge of replaced) updater?.removeEditorEdge(edge.id)
      const replacedIds = new Set(replaced.map(e => e.id))
      setEdges(eds =>
        addEdge(
          {
            id: edgeId,
            type: "BasicNodeEdge",
            zIndex: EDGE_Z_INDEX,
            ...connection,
            data: {
              source: { type: sourceType },
              target: { type: "editor" },
            },
          } as BasicEdge,
          replacedIds.size ? eds.filter(e => !replacedIds.has(e.id)) : eds,
        ),
      )
      updater?.addEditorEdge(
        edgeId,
        connection.source,
        connection.sourceHandle,
        connection.target,
        connection.targetHandle,
      )
    },
    [setEdges],
  )

  const onConnectNode = useCallback(
    (connection: Connection) => {
      // Clear start params so onConnectEnd won't show the context menu
      connectStartRef.current = null

      const graphName = refGraphEndpoint.current?.graphName
      const engineGatewayUrl = engineGatewayUrlRef.current
      if (!graphName || !engineGatewayUrl) {
        return
      }

      const sourceNodeType = getNodeType(connection.source)
      const targetNodeType = getNodeType(connection.target)

      if (sourceNodeType == "editor" && targetNodeType == "input") {
        const edgeId = getEditorEdgeId(
          connection.source,
          connection.sourceHandle,
          connection.target,
          connection.targetHandle,
        )

        setEdges(eds =>
          addEdge(
            {
              id: edgeId,
              type: "BasicNodeEdge",
              zIndex: EDGE_Z_INDEX,
              ...connection,
              data: {
                source: {
                  type: "editor",
                },
                target: {
                  type: "input",
                },
              },
            } as BasicEdge,
            eds,
          ),
        )
        editorModelUpdaterRef.current?.addEditorEdge(
          edgeId,
          connection.source,
          connection.sourceHandle,
          connection.target,
          connection.targetHandle,
        )
        return
      }
      if (sourceNodeType == "output" && targetNodeType == "editor") {
        connectEditorInput(connection, "output")
        return
      }
      if (sourceNodeType == "node" && targetNodeType == "editor") {
        if (!inspectorAvailableRef.current) {
          enqueueSnackbar(
            "Direct connections need the inspector (engine 1.1 or later, turned on). Connect the node to an output port and the output port to the display instead.",
            { variant: "info" },
          )
          return
        }
        connectEditorInput(connection, "node")
        return
      }

      if (sourceNodeType == "input" && targetNodeType == "node") {
        const source = `.${connection.source.slice("$input:".length)}`
        const target = `${connection.target}.${connection.targetHandle}`

        const edgeId = `${source}-${connection.target}.${connection.targetHandle}`

        graphAddEdge(engineGatewayUrl, graphName, source, target).catch(
          error => {
            enqueueSnackbar(error.message, { variant: "error" })
            setEdges(eds => eds.filter(edge => edge.id != edgeId))
          },
        )
        setEdges(eds =>
          addEdge(
            {
              id: edgeId,
              ...connection,
              type: "BasicNodeEdge",
              zIndex: EDGE_Z_INDEX,
              data: {
                source: {
                  type: "input",
                },
                target: {
                  type: "node",
                },
              },
            } as BasicEdge,
            eds,
          ),
        )
        return
      }

      if (sourceNodeType == "node" && targetNodeType == "output") {
        const source = `${connection.source}.${connection.sourceHandle}`
        const target = `.${connection.target.slice("$output:".length)}`

        const edgeId = `${connection.source}.${connection.sourceHandle}-${target}`

        // console.log(connection)
        graphAddEdge(engineGatewayUrl, graphName, source, target).catch(
          error => {
            enqueueSnackbar(error.message, { variant: "error" })
            setEdges(eds => eds.filter(edge => edge.id != edgeId))
          },
        )
        setEdges(eds =>
          addEdge(
            {
              id: edgeId,
              ...connection,
              type: "BasicNodeEdge",
              zIndex: EDGE_Z_INDEX,
              data: {
                source: {
                  type: "node",
                },
                target: {
                  type: "output",
                },
              },
            } as BasicEdge,
            eds,
          ),
        )
        return
      }
      if (sourceNodeType == "node" && targetNodeType == "node") {
        const source = `${connection.source}.${connection.sourceHandle}`
        const target = `${connection.target}.${connection.targetHandle}`

        const edgeId = `${connection.source}.${connection.sourceHandle}-${connection.target}.${connection.targetHandle}`

        graphAddEdge(engineGatewayUrl, graphName, source, target).catch(
          error => {
            enqueueSnackbar(error.message, {
              variant: "error",
              persist: true,
              action: SnackbarActionClose,
            })
            setEdges(eds => eds.filter(edge => edge.id != edgeId))
          },
        )
        setEdges(eds =>
          addEdge(
            {
              id: edgeId,
              ...connection,
              type: "BasicNodeEdge",
              zIndex: EDGE_Z_INDEX,
              data: {
                source: {
                  type: "node",
                },
                target: {
                  type: "node",
                },
              },
            } as BasicEdge,
            eds,
          ),
        )
        return
      }
    },
    [setEdges, connectEditorInput],
  )

  // Pin from a peek popover: a display node next to the engine node,
  // connected with a dashed (inspector) edge.
  const handlePinRequest = useCallback(
    (request: PinRequest) => {
      const instance = reactFlowInstanceRef.current
      const updater = editorModelUpdaterRef.current
      const endpoint = refGraphEndpoint.current
      const target = PIN_TARGETS[request.kind]
      if (!instance || !updater || !endpoint || !target) return

      const source = instance.getInternalNode(request.ref.node)
      const origin = source?.internals.positionAbsolute ?? { x: 0, y: 0 }
      const width = source?.measured.width ?? 200
      const size = EDITOR_NODE_SPEC_BY_TYPE.get(target.type)?.size
      // Next to the engine node, moved down/right until it overlaps nothing.
      const occupied: Rect[] = []
      for (const n of instance.getNodes()) {
        if (n.id === "$graph") continue
        const internal = instance.getInternalNode(n.id)
        if (!internal) continue
        const abs = internal.internals.positionAbsolute
        occupied.push({ x: abs.x, y: abs.y, width: internal.measured.width ?? 160, height: internal.measured.height ?? 80 })
      }
      const box = size ?? { width: 500, height: 300 }
      // Next to the node if there is room nearby; otherwise just above the
      // $graph frame, in line with the node (left to right among other pins).
      const near = { x: origin.x + width + 60, y: origin.y }
      let spot = findFreeSpot(near, box, occupied, { columns: 1, rows: 12 })
      if (spot === near && occupied.some(o => rectsOverlap(o, { ...near, ...box }))) {
        const frame = instance.getInternalNode("$graph")
        const frameTop = frame?.internals.positionAbsolute.y ?? 0
        spot = findFreeSpot(
          { x: origin.x, y: frameTop - box.height - 60 },
          box,
          occupied,
          { columns: 12, rows: 1, columnWidth: box.width + 40 },
        )
      }
      const x = Math.round(spot.x / 20) * 20
      const y = Math.round(spot.y / 20) * 20
      // Images keep the peek's channel order; charts record right away.
      const nodeData: Record<string, unknown> =
        target.type === "ImageDisplayNode" ? { colorOrder: request.colorOrder ?? "rgb" } : { recordOnOpen: true }

      const id = generateEditorNodeId(target.type)
      const node = nodeRegistryRef.current.registerEditorNode(
        makeEditorNode({
          id,
          type: target.type,
          position: { x, y },
          data: {
            label: `${request.ref.node}.${request.ref.port}`,
            graphEndpoint: endpoint,
            editorModelUpdater: updater,
            nodeData,
          },
          ...(size ? { style: { width: size.width, height: size.height } } : {}),
          dragHandle: ".drag-handle",
        } as Node),
      )
      setNodes(nds => [...nds, node])
      updater.addEditorNode(node.id, target.type, x, y)
      updater.setNodeLabel(node.id, `${request.ref.node}.${request.ref.port}`)
      if (size) updater.updateNodeSize(node.id, size.width, size.height)
      updater.patchNodeData(node.id, nodeData)
      connectEditorInput(
        {
          source: request.ref.node,
          sourceHandle: request.ref.port,
          target: node.id,
          targetHandle: target.handle,
        },
        "node",
      )
    },
    [setNodes, connectEditorInput],
  )

  // Edge dropped on the canvas -> "Show in <view>": a view node at the drop
  // point, fed by a dashed (inspector) edge from the dragged output.
  const viewCatalogRef = useRef<ReadonlyMap<string, { title: string; size?: { width: number; height: number } }>>(new Map())
  const handleEdgeDropView = useCallback(
    (viewKey: string, input: string) => {
      const drop = edgeDropMenuStateRef.current
      const updater = editorModelUpdaterRef.current
      const endpoint = refGraphEndpoint.current
      if (!drop || !drop.sourceHandleId || !updater || !endpoint) return
      const entry = viewCatalogRef.current.get(viewKey)
      const size = entry?.size ?? { width: 420, height: 320 }
      const id = generateEditorNodeId("PluginViewNode")
      const nodeData = { view: viewKey, settings: {} }
      const node = nodeRegistryRef.current.registerEditorNode(
        makeEditorNode({
          id,
          type: "PluginViewNode",
          position: drop.flowPosition,
          data: { label: entry?.title ?? viewKey, graphEndpoint: endpoint, editorModelUpdater: updater, nodeData },
          style: { width: size.width, height: size.height },
          dragHandle: ".drag-handle",
        } as Node),
      )
      setNodes(nds => [...nds, node])
      updater.addEditorNode(node.id, "PluginViewNode", drop.flowPosition.x, drop.flowPosition.y)
      updater.setNodeLabel(node.id, entry?.title ?? viewKey)
      updater.updateNodeSize(node.id, size.width, size.height)
      updater.patchNodeData(node.id, nodeData)
      connectEditorInput(
        { source: drop.sourceNodeId, sourceHandle: drop.sourceHandleId, target: node.id, targetHandle: input },
        "node",
      )
    },
    [setNodes, connectEditorInput],
  )

  // "Make output port" on a dashed edge: engine node -> new $output port ->
  // the same display input (solid). The port dialog is pre-filled.
  const [promoteRequest, setPromoteRequest] = useState<
    (EdgeEndpoints & { valueTypes: string; position: { x: number; y: number } }) | null
  >(null)

  const handlePromoteRequest = useCallback((edge: EdgeEndpoints) => {
    const instance = reactFlowInstanceRef.current
    const source = instance?.getNode(edge.source) as BasicEngineNode | undefined
    if (!source || !edge.sourceHandle) return
    const output = source.data.nodeData.outputs.find(o => o.name === edge.sourceHandle)
    const width = instance?.getInternalNode(edge.source)?.measured.width ?? 200
    setPromoteRequest({
      ...edge,
      valueTypes: output ? output.values.map(v => v.type).join(",") : "",
      // Port nodes live in the $graph frame: position relative to it.
      position: { x: source.position.x + width + 60, y: source.position.y },
    })
  }, [])

  // --- Edge-drop: onConnectStart / onConnectEnd ---

  const onConnectStart = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      params: {
        nodeId: string | null
        handleId: string | null
        handleType: "source" | "target" | null
      },
    ) => {
      if (params.nodeId && params.handleType) {
        connectStartRef.current = {
          nodeId: params.nodeId,
          handleId: params.handleId,
          handleType: params.handleType,
        }
      }
    },
    [],
  )

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const params = connectStartRef.current
    connectStartRef.current = null
    if (!params) return
    if (GRAPH_EDIT_DISABLED) return

    // Only show menu for engine nodes
    if (getNodeType(params.nodeId) !== "node") return

    // Check if dropped on empty canvas
    const target = event.target as HTMLElement
    if (!target.classList.contains("react-flow__pane")) return

    let clientX: number
    let clientY: number
    if (event instanceof MouseEvent) {
      clientX = event.clientX
      clientY = event.clientY
    } else {
      const touch = event.changedTouches[0]
      clientX = touch.clientX
      clientY = touch.clientY
    }

    const flowPosition = reactFlowInstanceRef.current?.screenToFlowPosition({
      x: clientX,
      y: clientY,
    }) ?? { x: 0, y: 0 }

    setEdgeDropMenuState({
      screenPosition: { x: clientX, y: clientY },
      flowPosition,
      sourceNodeId: params.nodeId,
      sourceHandleId: params.handleId,
      sourceHandleType: params.handleType,
    })
  }, [])

  const handleEdgeDropPortCreated = useCallback(
    (
      portNode: Node,
      connection: {
        sourceNodeId: string
        sourceHandleId: string | null
        portNodeId: string
        portType: "input" | "output"
      },
    ) => {
      const graphName = refGraphEndpoint.current?.graphName
      const engineGatewayUrl = engineGatewayUrlRef.current
      if (!graphName || !engineGatewayUrl) return

      // Add port node to canvas
      editorModelUpdaterRef.current?.addEditorNode(
        portNode.id,
        portNode.type!,
        portNode.position.x,
        portNode.position.y,
      )
      setNodes(nds => [...nds, portNode])

      // Auto-connect the edge
      if (connection.portType === "output") {
        // Engine node output → Graph output port
        const source = `${connection.sourceNodeId}.${connection.sourceHandleId}`
        const target = `.${connection.portNodeId.slice("$output:".length)}`
        const edgeId = `${source}-${target}`

        graphAddEdge(engineGatewayUrl, graphName, source, target).catch(
          error => {
            enqueueSnackbar(error.message, { variant: "error" })
            setEdges(eds => eds.filter(edge => edge.id !== edgeId))
          },
        )

        setEdges(eds =>
          addEdge(
            {
              id: edgeId,
              source: connection.sourceNodeId,
              sourceHandle: connection.sourceHandleId,
              target: connection.portNodeId,
              type: "BasicNodeEdge",
              zIndex: EDGE_Z_INDEX,
              data: {
                source: { type: "node" },
                target: { type: "output" },
              },
            } as BasicEdge,
            eds,
          ),
        )
      } else {
        // Graph input port → Engine node input
        const source = `.${connection.portNodeId.slice("$input:".length)}`
        const target = `${connection.sourceNodeId}.${connection.sourceHandleId}`
        const edgeId = `${source}-${target}`

        graphAddEdge(engineGatewayUrl, graphName, source, target).catch(
          error => {
            enqueueSnackbar(error.message, { variant: "error" })
            setEdges(eds => eds.filter(edge => edge.id !== edgeId))
          },
        )

        setEdges(eds =>
          addEdge(
            {
              id: edgeId,
              source: connection.portNodeId,
              target: connection.sourceNodeId,
              targetHandle: connection.sourceHandleId,
              type: "BasicNodeEdge",
              zIndex: EDGE_Z_INDEX,
              data: {
                source: { type: "input" },
                target: { type: "node" },
              },
            } as BasicEdge,
            eds,
          ),
        )
      }

      setEdgeDropMenuState(null)
    },
    [setNodes, setEdges],
  )

  const [engineGatewayState, engineGatewayStateActions] =
    useEngineGatewayStateStore()
  const [engineGatewaySettingsDialogOpen, setEngineGatewaySettingsDialogOpen] =
    useState(false)
  const [nodeSearchDialogOpen, setNodeSearchDialogOpen] = useState(false)
  const [dataBrowserOpen, setDataBrowserOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [envSettingsOpen, setEnvSettingsOpen] = useState(false)

  useEffect(() => {
    if (!engineGatewayState.initialized) {
      return
    }

    const engineGatewayUrl = engineGatewayState.engineGatewayUrl
    if (engineGatewayUrl == undefined) {
      setEngineGatewaySettingsDialogOpen(true)
      return
    }

    const graphName = routerState.hash.slice(1)
    if (graphName == "") {
      return
    }

    // 進捗状態を開始
    setProgressState({
      isActive: true,
      current: 0,
      total: 0,
      message: undefined,
      startTime: Date.now(),
    })

    buildGraph(
      engineGatewayUrl,
      graphName,
      nodeRegistryRef.current,
      GRAPH_EDIT_DISABLED,
      (current, total, message) => {
        setProgressState(prev => ({
          ...prev,
          current,
          total,
          message,
        }))
      },
    )
      .then(result => {
        if (!result) {
          throw new Error("Failed to build graph")
        }
        const { nodes, edges, graphEndpoint, editorModelUpdater } = result
        setNodes(nodes)
        setEdges(edges)
        // console.log("!!!!", editorModelUpdater)
        refGraphEndpoint.current = graphEndpoint
        editorModelUpdaterRef.current = editorModelUpdater
        engineGatewayUrlRef.current = engineGatewayUrl
        graphSessionActions.setSession(graphEndpoint, editorModelUpdater)
        setConnectedEngineUrl(engineGatewayUrl)
        setNodePrototypes(makeNodePrototypes(graphEndpoint, editorModelUpdater))
      })
      .catch(error => {
        enqueueSnackbar(`${error}`, { variant: "error" })
      })
      .finally(() => {
        setProgressState(prev => ({ ...prev, isActive: false }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- graphSessionActions is stable (memoized)
  }, [routerState, engineGatewayState, setEdges, setNodes])

  useEffect(() => {
    return () => {
      if (refGraphEndpoint.current) {
        refGraphEndpoint.current.close()
      }
    }
  }, [])

  const [settingsMenuAnchorEl, setSettingsMenuAnchorEl] =
    useState<HTMLElement | null>(null)

  // Helper function to serialize selected nodes and edges
  // Copy and delete read the graph when they run, not from render, so they
  // (and the keyboard listener that calls them) are not recreated by every
  // node move.
  const serializeSelection = useCallback((): ClipboardData | null => {
    const instance = reactFlowInstanceRef.current
    if (!instance) return null
    const nodes = instance.getNodes()
    const selectedNodes = nodes.filter(node => node.selected)
    const selectedEdges = instance.getEdges().filter(edge => edge.selected)

    if (selectedNodes.length === 0) {
      return null
    }

    // Convert selected nodes to clipboard format
    const clipboardNodes: ClipboardNodeData[] = selectedNodes.map(node => {
      const nodeType = getNodeType(node.id)

      // Base data for all node types
      const baseData: ClipboardNodeData = {
        name: node.id,
        type: node.type || "default",
        nodeType: nodeType,
        properties: {},
        position: {
          x: node.position.x,
          y: node.position.y,
        },
      }

      // Handle different node types
      switch (nodeType) {
        case "node": {
          // Engine node - use original logic
          const originalName =
            typeof node.data.label === "string" ? node.data.label : node.id
          const nodeData =
            node.data &&
            typeof node.data === "object" &&
            "nodeData" in node.data
              ? (node.data as NodeDataStructure).nodeData
              : null

          return {
            ...baseData,
            name: originalName,
            type: nodeData?.type || node.type || "default",
            properties: nodeData?.properties || {},
            inputs: nodeData?.inputs || undefined,
          }
        }

        case "editor": {
          // Editor node - nodeData contains all persisted settings
          const nodeData = node.data || {}
          const editorSpecificData = ((nodeData as Record<string, unknown>)
            .nodeData || {}) as Record<string, unknown>

          // Get width and height from various possible sources
          let width = node.width
          let height = node.height

          // Fallback to style if width/height not directly available
          if (!width && node.style?.width) {
            width =
              typeof node.style.width === "string"
                ? parseInt(node.style.width.replace("px", ""))
                : (node.style.width as number)
          }
          if (!height && node.style?.height) {
            height =
              typeof node.style.height === "string"
                ? parseInt(node.style.height.replace("px", ""))
                : (node.style.height as number)
          }

          // NOTE: Do NOT fallback to node.measured dimensions.
          // Only nodes with explicit sizes (from NodeResizer) should have their sizes copied.
          // Content-driven nodes (no NodeResizer) will have undefined width/height, which is correct.

          console.log(`Serializing editor node ${node.id}:`, {
            nodeWidth: node.width,
            nodeHeight: node.height,
            styleWidth: node.style?.width,
            styleHeight: node.style?.height,
            finalWidth: width,
            finalHeight: height,
          })

          return {
            ...baseData,
            name: node.id,
            type: node.type || "default",
            editorData: {
              width: width,
              height: height,
              data: editorSpecificData, // This now includes comment, etc.
            },
          }
        }

        case "input": {
          // Graph input node
          const portName = node.id.slice("$input:".length)
          // Extract all port.values following BasicPortNode structure
          const nodeData = node.data as {
            port?: { values?: { type: string }[] }
            defaultValue?: unknown
          }
          const values = nodeData?.port?.values || [{ type: "any" }]
          return {
            ...baseData,
            name: node.id,
            type: "input",
            portData: {
              portName: portName,
              values: values,
              defaultValue: nodeData?.defaultValue,
            },
          }
        }

        case "output": {
          // Graph output node
          const portName = node.id.slice("$output:".length)
          // Extract all port.values following BasicPortNode structure
          const nodeData = node.data as {
            port?: { values?: { type: string }[] }
          }
          const values = nodeData?.port?.values || [{ type: "any" }]
          return {
            ...baseData,
            name: node.id,
            type: "output",
            portData: {
              portName: portName,
              values: values,
            },
          }
        }

        default:
          return baseData
      }
    })

    // Convert selected edges to clipboard format with node type info
    const selectedNodeIds = new Set(selectedNodes.map(n => n.id))
    const clipboardEdges: ClipboardEdgeData[] = selectedEdges
      .filter(
        edge =>
          selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
      )
      .map(edge => {
        const sourceNodeType = getNodeType(edge.source)
        const targetNodeType = getNodeType(edge.target)

        // Carry waypointIds for edges with mid-route waypoints, but drop
        // references to waypoints outside the selection — otherwise paste
        // would create ghost references pointing at non-existent IDs.
        const wpIds = (edge.data as Record<string, unknown> | undefined)
          ?.waypointIds as string[] | undefined
        const waypointsInSelection = filterWaypointsInSelection(
          wpIds,
          selectedNodeIds,
        )

        return {
          source: edge.sourceHandle
            ? `${edge.source}.${edge.sourceHandle}`
            : edge.source,
          target: edge.targetHandle
            ? `${edge.target}.${edge.targetHandle}`
            : edge.target,
          sourceNodeType: sourceNodeType,
          targetNodeType: targetNodeType,
          ...(waypointsInSelection.length > 0
            ? { waypoints: waypointsInSelection }
            : {}),
        }
      })

    return {
      nodes: clipboardNodes,
      edges: clipboardEdges,
    }
  }, [])

  // Copy functionality
  const handleCopy = useCallback(async () => {
    const clipboardData = serializeSelection()
    if (!clipboardData) {
      enqueueSnackbar("No nodes selected for copying")
      return
    }

    try {
      console.log(
        "Clipboard data being saved:",
        JSON.stringify(clipboardData, null, 2),
      )
      await navigator.clipboard.writeText(JSON.stringify(clipboardData))

      // Count node types for better feedback
      const nodeTypeCounts = clipboardData.nodes.reduce(
        (acc, node) => {
          acc[node.nodeType] = (acc[node.nodeType] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      const message = Object.entries(nodeTypeCounts)
        .map(([type, count]) => {
          const typeLabel = type === "node" ? "engine" : type
          return `${count} ${typeLabel} node${count > 1 ? "s" : ""}`
        })
        .join(", ")

      enqueueSnackbar(`Copied ${message} to clipboard`)
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
      enqueueSnackbar("Failed to copy to clipboard", { variant: "error" })
    }
  }, [serializeSelection])

  // Paste functionality
  const handlePaste = useCallback(async () => {
    const graphName = refGraphEndpoint.current?.graphName
    const engineGatewayUrl = engineGatewayUrlRef.current

    if (!graphName || !engineGatewayUrl) {
      enqueueSnackbar("Graph not ready for pasting", { variant: "error" })
      return
    }

    try {
      const clipboardText = await navigator.clipboard.readText()
      const clipboardData: ClipboardData = JSON.parse(clipboardText)

      if (!clipboardData.nodes || !Array.isArray(clipboardData.nodes)) {
        throw new Error("Invalid clipboard data format")
      }

      // 進捗状態を開始: total = ノード数 + エッジ数
      const totalSteps = clipboardData.nodes.length + clipboardData.edges.length
      let currentStep = 0
      setProgressState({
        isActive: true,
        current: 0,
        total: totalSteps,
        message: undefined,
        startTime: Date.now(),
      })

      // Calculate the bounding box of copied nodes to find relative positions
      const minX = Math.min(...clipboardData.nodes.map(n => n.position?.x || 0))
      const minY = Math.min(...clipboardData.nodes.map(n => n.position?.y || 0))

      // Get current viewport position for pasting at visible area
      const viewport = reactFlowInstanceRef.current?.getViewport()
      const viewportX = viewport ? -viewport.x / viewport.zoom : 0
      const viewportY = viewport ? -viewport.y / viewport.zoom : 0

      // Add offset from viewport top-left corner
      const pasteOffsetX = viewportX + 100
      const pasteOffsetY = viewportY + 100

      // Create nodes via API and track name mapping for edges
      const createdNodes: CreatedNodeResponse[] = []
      const nameMapping: Map<string, string> = new Map() // original name -> new name
      const positionMapping: Map<string, { x: number; y: number }> = new Map() // node name -> position
      const createdNodeTypes: Map<
        string,
        "node" | "editor" | "input" | "output" | "waypoint"
      > = new Map()

      for (const nodeData of clipboardData.nodes) {
        // Calculate new position maintaining relative positions
        const newX = pasteOffsetX + (nodeData.position?.x || 0) - minX
        const newY = pasteOffsetY + (nodeData.position?.y || 0) - minY

        // Handle different node types
        let createdNode: CreatedNodeResponse
        let newNodeId: string

        switch (nodeData.nodeType || "node") {
          case "node": {
            // Engine node - use original logic
            const requestData: CreateNodeRequestData = {
              type: nodeData.type,
              properties: nodeData.properties,
            }

            const response = await fetch(
              `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/nodes`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestData),
              },
            )

            if (!response.ok) {
              throw new Error(`Failed to create node: ${response.statusText}`)
            }

            createdNode = await response.json()
            newNodeId = createdNode.name
            break
          }

          case "editor": {
            // Editor node - create via EditorModelUpdater with type prefix
            newNodeId = generateEditorNodeId(nodeData.type)

            if (editorModelUpdaterRef.current) {
              editorModelUpdaterRef.current.addEditorNode(
                newNodeId,
                nodeData.type,
                newX,
                newY,
              )

              // If there's additional editor data, patch it
              if (nodeData.editorData?.data) {
                editorModelUpdaterRef.current.patchNodeData(
                  newNodeId,
                  nodeData.editorData.data,
                )
              }
            }

            createdNode = {
              name: newNodeId,
              type: nodeData.type,
              properties: nodeData.properties || {},
            }
            break
          }

          case "input": {
            // Graph input node — strip existing paste suffix before adding new one
            const originalPortName = nodeData.portData?.portName || "input"
            const basePortName = stripPasteSuffix(originalPortName)
            const newPortName = `${basePortName}_${generateUniqueSuffix()}`
            newNodeId = `$input:${newPortName}`

            // Use POST method and correct data structure according to InputPortModel
            const inputResponse = await fetch(
              `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/inputs`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  name: newPortName,
                  values: nodeData.portData?.values || [{ type: "any" }],
                }),
              },
            )

            if (!inputResponse.ok) {
              throw new Error(
                `Failed to create input: ${inputResponse.statusText}`,
              )
            }

            createdNode = {
              name: newNodeId,
              type: "input",
              properties: {},
            }
            break
          }

          case "output": {
            // Graph output node — strip existing paste suffix before adding new one
            const originalPortName = nodeData.portData?.portName || "output"
            const basePortName = stripPasteSuffix(originalPortName)
            const newPortName = `${basePortName}_${generateUniqueSuffix()}`
            newNodeId = `$output:${newPortName}`

            // Use POST method and correct data structure according to OutputPortModel
            const outputResponse = await fetch(
              `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/outputs`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  name: newPortName,
                  values: nodeData.portData?.values || [{ type: "any" }],
                }),
              },
            )

            if (!outputResponse.ok) {
              throw new Error(
                `Failed to create output: ${outputResponse.statusText}`,
              )
            }

            createdNode = {
              name: newNodeId,
              type: "output",
              properties: {},
            }
            break
          }

          case "waypoint": {
            // Waypoint node — create via EditorModelUpdater
            newNodeId = generateWaypointId()

            if (editorModelUpdaterRef.current) {
              editorModelUpdaterRef.current.addEditorNode(
                newNodeId,
                "WaypointNode",
                newX,
                newY,
              )
            }

            createdNode = {
              name: newNodeId,
              type: "WaypointNode",
              properties: {},
            }
            break
          }

          default: {
            // Fallback to engine node creation
            const requestData: CreateNodeRequestData = {
              type: nodeData.type,
              properties: nodeData.properties,
            }

            const response = await fetch(
              `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/nodes`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestData),
              },
            )

            if (!response.ok) {
              throw new Error(`Failed to create node: ${response.statusText}`)
            }

            createdNode = await response.json()
            newNodeId = createdNode.name
          }
        }

        createdNodes.push(createdNode)
        nameMapping.set(nodeData.name, newNodeId)
        createdNodeTypes.set(newNodeId, nodeData.nodeType || "node")
        positionMapping.set(newNodeId, { x: newX, y: newY })

        // 進捗更新
        currentStep++
        setProgressState(prev => ({
          ...prev,
          current: currentStep,
          message: `Creating nodes... (${createdNodes.length}/${clipboardData.nodes.length})`,
        }))

        // Update node position via editor model updater (for engine nodes and editor nodes)
        if (
          editorModelUpdaterRef.current &&
          (nodeData.nodeType === "node" ||
            nodeData.nodeType === "editor" ||
            !nodeData.nodeType)
        ) {
          editorModelUpdaterRef.current.updateNodePosition(
            newNodeId,
            newX,
            newY,
          )
        }

        // Update input dispatch_flags if they exist in clipboard data (only for engine nodes)
        if (
          (nodeData.nodeType === "node" || !nodeData.nodeType) &&
          nodeData.inputs
        ) {
          console.log(
            `Updating inputs for node ${createdNode.name}:`,
            nodeData.inputs,
          )

          for (const inputData of nodeData.inputs) {
            if (
              inputData.values &&
              inputData.values.some(v => v.dispatch_flag !== undefined)
            ) {
              console.log(
                `Updating input "${inputData.name}" with values:`,
                inputData.values,
              )

              try {
                // Use the input port name (not array index) as required by the API
                const patchPayload = {
                  values: inputData.values.map(v => ({
                    dispatch_flag: v.dispatch_flag,
                  })),
                }
                console.log(
                  `PATCH payload for ${createdNode.name}/inputs/${inputData.name}:`,
                  patchPayload,
                )

                const patchResponse = await fetch(
                  `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/nodes/${encodeURIComponent(newNodeId)}/inputs/${encodeURIComponent(inputData.name)}`,
                  {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(patchPayload),
                  },
                )

                if (!patchResponse.ok) {
                  console.warn(
                    `Failed to update input "${inputData.name}" for node ${newNodeId}:`,
                    patchResponse.statusText,
                  )
                } else {
                  console.log(
                    `Successfully updated dispatch_flags for input "${inputData.name}" on node ${newNodeId}`,
                  )
                }
              } catch (error) {
                console.warn(
                  `Error updating input "${inputData.name}" for node ${newNodeId}:`,
                  error,
                )
              }
            }
          }
        }
      }

      // Create edges using the name mapping
      const createdEdgeResults: Array<{
        edgeData: ClipboardEdgeData
        newSourceName: string
        newTargetName: string
        sourceNodeType: string
        targetNodeType: string
        success: boolean
        edgeId?: string
        mappedWaypoints: string[]
      }> = []
      for (const edgeData of clipboardData.edges) {
        const sourceParsed = parseEdgeEndpoint(edgeData.source)
        const targetParsed = parseEdgeEndpoint(edgeData.target)

        // Skip edges that involve nodes not in the selection
        if (
          !nameMapping.has(sourceParsed.nodeName) ||
          !nameMapping.has(targetParsed.nodeName)
        ) {
          continue
        }

        const newSourceName = nameMapping.get(sourceParsed.nodeName)!
        const newTargetName = nameMapping.get(targetParsed.nodeName)!
        const sourceNodeType =
          createdNodeTypes.get(newSourceName) ||
          edgeData.sourceNodeType ||
          "node"
        const targetNodeType =
          createdNodeTypes.get(newTargetName) ||
          edgeData.targetNodeType ||
          "node"

        // Remap waypoint IDs from old (source-graph) to new (paste-graph)
        // via nameMapping. Waypoints not present in nameMapping (i.e. not
        // copied) are silently dropped — matches the serialize-side filter.
        const mappedWaypoints = mapClipboardWaypoints(
          edgeData.waypoints,
          nameMapping,
        )

        let success = false
        let edgeId: string | undefined

        // Handle different edge type combinations
        if (sourceNodeType === "editor" && targetNodeType === "input") {
          // Editor -> Input edge
          // For input nodes, targetHandle should be null when it's empty from parsing
          const sourceHandle = sourceParsed.portHandle
          const targetHandle =
            targetParsed.portHandle === "" ? null : targetParsed.portHandle

          edgeId = getEditorEdgeId(
            newSourceName,
            sourceHandle,
            newTargetName,
            targetHandle,
          )

          if (editorModelUpdaterRef.current) {
            editorModelUpdaterRef.current.addEditorEdge(
              edgeId,
              newSourceName,
              sourceHandle,
              newTargetName,
              targetHandle,
              mappedWaypoints,
            )
            success = true
          }
        } else if (sourceNodeType === "output" && targetNodeType === "editor") {
          // Output -> Editor edge
          // For output nodes, sourceHandle should be null when it's empty from parsing
          const sourceHandle =
            sourceParsed.portHandle === "" ? null : sourceParsed.portHandle
          const targetHandle = targetParsed.portHandle

          edgeId = getEditorEdgeId(
            newSourceName,
            sourceHandle,
            newTargetName,
            targetHandle,
          )

          if (editorModelUpdaterRef.current) {
            editorModelUpdaterRef.current.addEditorEdge(
              edgeId,
              newSourceName,
              sourceHandle,
              newTargetName,
              targetHandle,
              mappedWaypoints,
            )
            success = true
          }
        } else if (sourceNodeType === "editor" && targetNodeType === "editor") {
          // Editor -> Editor edge
          edgeId = getEditorEdgeId(
            newSourceName,
            sourceParsed.portHandle,
            newTargetName,
            targetParsed.portHandle,
          )

          if (editorModelUpdaterRef.current) {
            editorModelUpdaterRef.current.addEditorEdge(
              edgeId,
              newSourceName,
              sourceParsed.portHandle,
              newTargetName,
              targetParsed.portHandle,
              mappedWaypoints,
            )
            success = true
          }
        } else if (
          (sourceNodeType === "input" && targetNodeType === "node") ||
          (sourceNodeType === "node" && targetNodeType === "output") ||
          (sourceNodeType === "node" && targetNodeType === "node")
        ) {
          // Engine edges (Input->Node, Node->Output, Node->Node)
          const newSource =
            sourceNodeType === "input"
              ? `.${newSourceName.slice("$input:".length)}`
              : `${newSourceName}.${sourceParsed.portHandle}`
          const newTarget =
            targetNodeType === "output"
              ? `.${newTargetName.slice("$output:".length)}`
              : `${newTargetName}.${targetParsed.portHandle}`

          // Create edge via API
          try {
            const edgeResponse = await fetch(
              `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/edges`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  source: newSource,
                  target: newTarget,
                }),
              },
            )

            if (!edgeResponse.ok) {
              console.warn(
                `Failed to create edge ${newSource} -> ${newTarget}:`,
                edgeResponse.statusText,
              )
            } else {
              edgeId = `${newSource}-${newTarget}`
              success = true

              // Engine edges only get an editor_edges entry when they carry
              // waypoints (otherwise graph.json fully describes them — see
              // edge-handlers.ts cleanup logic). Mirror that invariant here.
              if (
                mappedWaypoints.length > 0 &&
                editorModelUpdaterRef.current
              ) {
                const sourceHandleForEditor =
                  sourceNodeType === "input"
                    ? null
                    : sourceParsed.portHandle || null
                const targetHandleForEditor =
                  targetNodeType === "output"
                    ? null
                    : targetParsed.portHandle || null
                const editorEdgeId = getEditorEdgeId(
                  newSourceName,
                  sourceHandleForEditor,
                  newTargetName,
                  targetHandleForEditor,
                )
                editorModelUpdaterRef.current.addEditorEdge(
                  editorEdgeId,
                  newSourceName,
                  sourceHandleForEditor,
                  newTargetName,
                  targetHandleForEditor,
                  mappedWaypoints,
                )
              }
            }
          } catch (error) {
            console.warn(
              `Error creating edge ${newSource} -> ${newTarget}:`,
              error,
            )
          }
        }

        createdEdgeResults.push({
          edgeData,
          newSourceName,
          newTargetName,
          sourceNodeType,
          targetNodeType,
          success,
          edgeId,
          mappedWaypoints,
        })

        // 進捗更新
        currentStep++
        setProgressState(prev => ({
          ...prev,
          current: currentStep,
          message: "Creating edges...",
        }))
      }

      const successfulEdges = createdEdgeResults.filter(
        result => result.success,
      ).length
      enqueueSnackbar(
        `Pasted ${createdNodes.length} node(s) and ${successfulEdges} edge(s) successfully`,
      )

      // Simply add the new nodes and edges to existing state without refetching
      if (refGraphEndpoint.current && editorModelUpdaterRef.current) {
        // Create new node objects from the created nodes with updated dispatch_flag info
        const newNodeObjects: Node[] = createdNodes.map(
          (createdNode, index) => {
            const position = positionMapping.get(createdNode.name)!
            const originalNodeData = clipboardData.nodes[index]
            const nodeType = originalNodeData.nodeType || "node"

            // Create node data based on node type
            let nodeObject: Node

            if (nodeType === "node") {
              // Engine node
              const nodeDataWithInputs = {
                ...createdNode,
                inputs: originalNodeData.inputs || createdNode.inputs || [],
              }

              nodeObject = {
                id: createdNode.name,
                data: {
                  label: createdNode.name,
                  variant: getEngineNodeVariant(createdNode.type),
                  nodeData: nodeDataWithInputs,
                  graphEndpoint: refGraphEndpoint.current,
                },
                position: position,
                type: getEngineNodeUIType(createdNode.type),
                dragHandle: ".drag-handle",
                parentId: "$graph",
                selected: true, // New pasted nodes are selected
              }
            } else if (nodeType === "editor") {
              // Editor node - restore settings data and inject proper runtime references
              const editorSpecificData = originalNodeData.editorData?.data || {}

              console.log(`Restoring editor node ${createdNode.name}:`, {
                originalWidth: originalNodeData.editorData?.width,
                originalHeight: originalNodeData.editorData?.height,
                editorSpecificData,
              })

              // Combine editor-specific data with runtime objects
              const nodeData = {
                nodeData: editorSpecificData, // Persisted settings grouped in nodeData
                label: createdNode.name,
                graphEndpoint: refGraphEndpoint.current,
                editorModelUpdater: editorModelUpdaterRef.current,
              }

              // Only apply size if explicit width and height are available
              const hasSize =
                originalNodeData.editorData?.width &&
                originalNodeData.editorData?.height

              nodeObject = makeEditorNode({
                id: createdNode.name,
                data: nodeData,
                position: position,
                type: originalNodeData.type,
                dragHandle: ".drag-handle",
                ...(hasSize
                  ? {
                      width: originalNodeData.editorData!.width,
                      height: originalNodeData.editorData!.height,
                      style: {
                        width: originalNodeData.editorData!.width,
                        height: originalNodeData.editorData!.height,
                      },
                    }
                  : {}),
                selected: true,
              } as Node)

              // Save the editor data to API for persistence
              if (editorModelUpdaterRef.current) {
                // Save node data if exists
                if (Object.keys(editorSpecificData).length > 0) {
                  editorModelUpdaterRef.current.patchNodeData(
                    createdNode.name,
                    editorSpecificData,
                  )
                }

                // Save node size if provided
                if (
                  originalNodeData.editorData?.width &&
                  originalNodeData.editorData?.height
                ) {
                  editorModelUpdaterRef.current.updateNodeSize(
                    createdNode.name,
                    originalNodeData.editorData.width,
                    originalNodeData.editorData.height,
                  )
                }
              }
            } else if (nodeType === "input" || nodeType === "output") {
              // Input/Output node - extract actual port name from the created node ID
              const actualPortName =
                nodeType === "input"
                  ? createdNode.name.slice("$input:".length)
                  : createdNode.name.slice("$output:".length)

              nodeObject = {
                id: createdNode.name,
                data: {
                  label: actualPortName,
                  port: {
                    name: actualPortName,
                    values: originalNodeData.portData?.values || [
                      { type: "any" },
                    ],
                  },
                  graphEditDisabled: false,
                  defaultValue: originalNodeData.portData?.defaultValue,
                },
                position: position,
                type: nodeType === "input" ? "BasicPortNode" : "BasicPortNode",
                parentId: "$graph",
                selected: true,
              }
            } else if (nodeType === "waypoint") {
              nodeObject = waypointNode(createdNode.name, position, true)
            } else {
              // Fallback
              nodeObject = {
                id: createdNode.name,
                data: {},
                position: position,
                type: originalNodeData.type,
                selected: true,
              }
            }

            return nodeObject
          },
        )

        // Create new edge objects from the successfully created edges
        const newEdgeObjects: Edge[] = []
        for (const edgeResult of createdEdgeResults) {
          if (edgeResult.success && edgeResult.edgeId) {
            const sourceParsed = parseEdgeEndpoint(edgeResult.edgeData.source)
            const targetParsed = parseEdgeEndpoint(edgeResult.edgeData.target)

            // React Flow uses node IDs, not Engine API edge endpoint format
            let reactFlowSource: string
            let reactFlowTarget: string
            let reactFlowSourceHandle: string | undefined
            let reactFlowTargetHandle: string | undefined

            // Convert Engine API names to React Flow node IDs and handle IDs
            if (edgeResult.sourceNodeType === "input") {
              reactFlowSource = edgeResult.newSourceName // "$input:inputName"
              reactFlowSourceHandle = undefined // Input nodes don't have sourceHandle
            } else if (edgeResult.sourceNodeType === "output") {
              reactFlowSource = edgeResult.newSourceName // "$output:outputName"
              reactFlowSourceHandle = undefined // Output nodes don't have sourceHandle
            } else {
              reactFlowSource = edgeResult.newSourceName // node name or editor name
              reactFlowSourceHandle = sourceParsed.portHandle
            }

            if (edgeResult.targetNodeType === "output") {
              reactFlowTarget = edgeResult.newTargetName // "$output:outputName"
              reactFlowTargetHandle = undefined // Output nodes don't have targetHandle
            } else if (edgeResult.targetNodeType === "input") {
              reactFlowTarget = edgeResult.newTargetName // "$input:inputName"
              reactFlowTargetHandle = undefined // Input nodes don't have targetHandle
            } else {
              reactFlowTarget = edgeResult.newTargetName // node name or editor name
              reactFlowTargetHandle = targetParsed.portHandle
            }

            const edgeObject: Partial<BasicEdge> = {
              id: edgeResult.edgeId,
              source: reactFlowSource,
              target: reactFlowTarget,
              type: "BasicNodeEdge",
              zIndex: EDGE_Z_INDEX,
              data: {
                source: {
                  type: edgeResult.sourceNodeType as
                    | "node"
                    | "editor"
                    | "input"
                    | "output",
                },
                target: {
                  type: edgeResult.targetNodeType as
                    | "node"
                    | "editor"
                    | "input"
                    | "output",
                },
                ...(edgeResult.mappedWaypoints.length > 0
                  ? { waypointIds: edgeResult.mappedWaypoints }
                  : {}),
              },
            }

            // Only add handle properties if they exist
            if (reactFlowSourceHandle !== undefined) {
              edgeObject.sourceHandle = reactFlowSourceHandle
            }
            if (reactFlowTargetHandle !== undefined) {
              edgeObject.targetHandle = reactFlowTargetHandle
            }

            newEdgeObjects.push(edgeObject as BasicEdge)
          }
        }

        // Update existing nodes to be unselected, then add new nodes
        setNodes(prevNodes => [
          ...prevNodes.map(n => ({ ...n, selected: false })), // Deselect all existing
          ...newNodeObjects, // Add new pasted nodes (selected)
        ])

        // Add new edges to existing edges
        setEdges(prevEdges => [...prevEdges, ...newEdgeObjects])
      }
    } catch (error) {
      console.error("Paste failed:", error)
      enqueueSnackbar(
        `Failed to paste: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { variant: "error" },
      )
    } finally {
      setProgressState(prev => ({ ...prev, isActive: false }))
    }
  }, [setNodes, setEdges])

  // Unselect all nodes
  const handleUnselectAll = useCallback(() => {
    setNodes((nds: Node[]) =>
      nds.map((node: Node) => ({
        ...node,
        selected: false,
      })),
    )
    setEdges((eds: Edge[]) =>
      eds.map((edge: Edge) => ({
        ...edge,
        selected: false,
      })),
    )
  }, [setNodes, setEdges])

  const onEdgeChangeFixed = useCallback(
    (changes: EdgeChange[]) => {
      // Deletion side effects are handled by onEdgesDelete (React Flow fires
      // it via deleteElements before triggerEdgeChanges). Here we only let
      // React Flow apply changes to local state (selection, default updates).
      setEdges(eds => applyEdgeChanges(changes, eds))
    },
    [setEdges],
  )

  const handleEdgesDeleteCb = useCallback(
    (deletedEdges: Edge[]) => {
      const graphName = refGraphEndpoint.current?.graphName
      const engineGatewayUrl = engineGatewayUrlRef.current
      const editorModelUpdater = editorModelUpdaterRef.current
      if (!graphName || !engineGatewayUrl || !editorModelUpdater) return
      handleEdgesDelete(
        deletedEdges,
        {
          engineGatewayUrl,
          graphName,
          // read now: the deleted edges are excluded by id either way
          edges: reactFlowInstanceRef.current?.getEdges() ?? [],
          setNodes,
          editorModelUpdater,
        },
        enqueueSnackbar,
      )
    },
    [setNodes],
  )

  const handleNodesDeleteCb = useCallback(
    (deletedNodes: Node[]) => {
      const graphName = refGraphEndpoint.current?.graphName
      const engineGatewayUrl = engineGatewayUrlRef.current
      const editorModelUpdater = editorModelUpdaterRef.current
      if (!graphName || !engineGatewayUrl || !editorModelUpdater) return
      handleNodesDelete(
        deletedNodes,
        {
          engineGatewayUrl,
          graphName,
          setEdges,
          nodeRegistry: nodeRegistryRef.current,
          editorModelUpdater,
        },
        enqueueSnackbar,
      )
    },
    [setEdges],
  )

  // Delete selected nodes and edges via React Flow's deleteElements so that
  // connected edges are auto-cascaded (getElementsToRemove + getConnectedEdges)
  // and the onNodesDelete / onEdgesDelete callbacks fire with the full set.
  // Keeping handleDeleteSelected (rather than relying on RF's built-in
  // deleteKeyCode) preserves the stricter keyboard guards in handleKeyDown:
  // - only fires when target is canvas / node selection rect / document.body
  // - skipped while user has a text selection
  const handleDeleteSelected = useCallback(() => {
    const instance = reactFlowInstanceRef.current
    if (!instance) return
    const selectedNodes = instance
      .getNodes()
      .filter((n: Node) => n.selected)
      .map((n: Node) => ({ id: n.id }))
    const selectedEdges = instance
      .getEdges()
      .filter((e: Edge) => e.selected)
      .map((e: Edge) => ({ id: e.id }))
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return
    instance.deleteElements({
      nodes: selectedNodes,
      edges: selectedEdges,
    })
  }, [])

  // Keyboard event handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const selection = window.getSelection()
      const hasTextSelection = selection && selection.toString().length > 0

      if (hasTextSelection) {
        return
      }

      const target = event.target as HTMLElement

      // Check if the target is a ReactFlow element (node or selection rect)
      const isFlowNodesElement =
        target.classList.contains("react-flow__node") ||
        target.classList.contains("react-flow__nodesselection-rect")

      const isBody = target === document.body

      if (!isFlowNodesElement && !isBody) {
        return
      }

      // Handle ESC key to unselect all nodes
      if (event.key === "Escape") {
        event.preventDefault()
        handleUnselectAll()
        return
      }

      // Handle Backspace/Delete key to delete selected nodes
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault()
        handleDeleteSelected()
        return
      }

      // Only handle copy/paste when target is a ReactFlow element
      if (event.ctrlKey || event.metaKey) {
        if (event.key === "c") {
          event.preventDefault()
          handleCopy()
        } else if (event.key === "v") {
          event.preventDefault()
          handlePaste()
        }
      }
    },
    [handleCopy, handlePaste, handleUnselectAll, handleDeleteSelected],
  )

  // Add keyboard event listeners
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  // Prevent browser zoom on ctrl+scroll
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
      }
    }

    // Add the event listener with passive: false to allow preventDefault
    document.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      document.removeEventListener("wheel", handleWheel)
    }
  }, [])

  // The page's controls, menus and dialogs: built again only when what they
  // show changes, not on every node move (the page re-renders with the nodes
  // it hands to <ReactFlow>, and these, mostly closed, would render with it).
  const graphEndpoint = refGraphEndpoint.current
  const nodeRegistry = nodeRegistryRef.current
  // The search lists the nodes while open; closed, a node move does not reach it
  const searchNodes = nodeSearchDialogOpen ? nodes : NO_NODES
  const overlays = useMemo(
    () => (
      <>
          <div
            css={css({
              position: "absolute",
              right: 8,
              top: 8,
              display: "flex",
              gap: 4,
            })}
          >
            <EngineAboutControls
              engineGatewayUrl={connectedEngineUrl}
              open={aboutOpen}
              onOpen={() => setAboutOpen(true)}
              onClose={() => setAboutOpen(false)}
            />
            <EnvSettingsDialog
              open={envSettingsOpen}
              onClose={() => setEnvSettingsOpen(false)}
              engineGatewayUrl={connectedEngineUrl}
            />
            <InspectorStatusButton />
            <IconButton
              title="Refresh graph"
              onClick={() => {
                if (progressState.isActive) return
                const graphName = routerState.hash.slice(1)
                const url = engineGatewayUrlRef.current
                if (!graphName || !url) return
                setProgressState({
                  isActive: true,
                  current: 0,
                  total: 0,
                  message: "Refreshing...",
                  startTime: Date.now(),
                })
                refreshGraph(
                  url,
                  graphName,
                  setNodes,
                  setEdges,
                  (current, total, message) => {
                    setProgressState(prev => ({
                      ...prev,
                      current,
                      total,
                      message,
                    }))
                  },
                )
                  .catch(error =>
                    enqueueSnackbar(`Refresh failed: ${error}`, {
                      variant: "error",
                    }),
                  )
                  .finally(() =>
                    setProgressState(prev => ({ ...prev, isActive: false })),
                  )
              }}
            >
              <Refresh />
            </IconButton>
            <IconButton
              onClick={() => {
                setNodeSearchDialogOpen(true)
              }}
            >
              <Search />
            </IconButton>
            <IconButton
              title="Data browser"
              onClick={() => setDataBrowserOpen(prev => !prev)}
            >
              <FolderOpen />
            </IconButton>
            <IconButton
              onClick={event => {
                setSettingsMenuAnchorEl(event.currentTarget)
              }}
            >
              <MoreVert />
            </IconButton>
            <Menu
              open={Boolean(settingsMenuAnchorEl)}
              anchorEl={settingsMenuAnchorEl}
              onClose={() => {
                setSettingsMenuAnchorEl(null)
              }}
            >
              <MenuItem
                onClick={() => {
                  setEngineGatewaySettingsDialogOpen(true)
                  setSettingsMenuAnchorEl(null)
                }}
              >
                Engine Gateway Settings
              </MenuItem>
              <EnvSettingsMenuItem
                engineGatewayUrl={connectedEngineUrl}
                onClick={() => {
                  setEnvSettingsOpen(true)
                  setSettingsMenuAnchorEl(null)
                }}
              />
              <MenuItem
                onClick={() => {
                  setAboutOpen(true)
                  setSettingsMenuAnchorEl(null)
                }}
              >
                About nonoha Editor
              </MenuItem>

              <div
                css={css({
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 16,
                  paddingLeft: 16,
                  paddingRight: 16,
                })}
              >
                <Typography css={css({})}>Theme Mode</Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive={true}
                  value={themeState.scheme.isDark ? "dark" : "light"}
                  onChange={(event, newValue) => {
                    console.log(newValue)
                    themeStoreActions.setMode(newValue)
                  }}
                >
                  <ToggleButton
                    value="light"
                    css={css({
                      flexGrow: 1,
                    })}
                  >
                    <LightMode />
                  </ToggleButton>
                  <ToggleButton
                    value="dark"
                    css={css({
                      flexGrow: 1,
                    })}
                  >
                    <DarkMode />
                  </ToggleButton>
                </ToggleButtonGroup>
              </div>
            </Menu>
          </div>
          <Fab
            css={css`
              position: absolute;
              bottom: 40px;
              right: 40px;
            `}
            onClick={() => setNodeAddDialogOpen(true)}
          >
            <Add />
          </Fab>
          <NodeAddMenu
            open={nodeAddDialogOpen}
            graphEndpoint={graphEndpoint}
            nodeRegistry={nodeRegistry}
            onClose={() => {
              setNodeAddDialogOpen(false)
            }}
            nodePrototypes={allNodePrototypes}
            onNodeAdd={node => {
              if (node.type == undefined) {
                return
              }
              const updater = editorModelUpdaterRef.current
              updater?.addEditorNode(node.id, node.type, node.position.x, node.position.y)
              // Views (and other prototypes with initial data) persist it right away.
              const initial = (node.data as { nodeData?: Record<string, unknown> }).nodeData
              if (initial) updater?.patchNodeData(node.id, initial)
              if (node.type === "PluginViewNode") updater?.setNodeLabel(node.id, String(node.data.label))
              const style = node.style as { width?: number; height?: number } | undefined
              if (style?.width && style?.height) updater?.updateNodeSize(node.id, style.width, style.height)
              setNodes(nds => [...nds, node])
            }}
            graphEditDisabled={GRAPH_EDIT_DISABLED}
            existingInputPortNames={existingInputPortNames}
            existingOutputPortNames={existingOutputPortNames}
          />
          <EdgeDropContextMenu
            state={edgeDropMenuState}
            graphEndpoint={graphEndpoint}
            onClose={() => setEdgeDropMenuState(null)}
            onPortCreated={handleEdgeDropPortCreated}
            onViewSelected={handleEdgeDropView}
            existingPortNames={
              edgeDropMenuState?.sourceHandleType === "target"
                ? existingInputPortNames
                : existingOutputPortNames
            }
          />
          <PortAddDialog
            open={promoteRequest !== null}
            portType="output"
            graphEndpoint={graphEndpoint}
            onClose={() => setPromoteRequest(null)}
            onPortAdd={portNode => {
              const request = promoteRequest
              setPromoteRequest(null)
              if (!request) return
              handleEdgeDropPortCreated(portNode, {
                sourceNodeId: request.source,
                sourceHandleId: request.sourceHandle,
                portNodeId: portNode.id,
                portType: "output",
              })
              // Same display input, now fed by the port (replaces the dashed edge).
              connectEditorInput(
                { source: portNode.id, sourceHandle: null, target: request.target, targetHandle: request.targetHandle },
                "output",
              )
            }}
            initialValueTypeList={promoteRequest?.valueTypes}
            initialPosition={promoteRequest?.position}
            initialPortName={promoteRequest?.sourceHandle ?? undefined}
            existingPortNames={existingOutputPortNames}
          />
          <EngineGatewaySettingsDialog
            open={engineGatewaySettingsDialogOpen}
            onClose={() => {
              setEngineGatewaySettingsDialogOpen(false)
            }}
          />
          <NodeSearchDialog
            open={nodeSearchDialogOpen}
            onClose={() => {
              setNodeSearchDialogOpen(false)
            }}
            nodes={searchNodes}
            onNodeSelect={nodeId => {
              const instance = reactFlowInstanceRef.current
              if (!instance) return

              const node = instance.getNode(nodeId)
              if (!node) return

              // Get node center position
              const nodeWidth = node.measured?.width ?? node.width ?? 200
              const nodeHeight = node.measured?.height ?? node.height ?? 100
              const nodeCenterX = node.position.x + nodeWidth / 2
              const nodeCenterY = node.position.y + nodeHeight / 2

              // Get current zoom level
              const { zoom } = instance.getViewport()

              // Offset Y to position node in lower half (accounting for dialog at top)
              // Positive offset moves viewport up, showing node lower on screen
              const viewportHeight = window.innerHeight
              const yOffset = (viewportHeight * 0.2) / zoom

              instance.setCenter(nodeCenterX, nodeCenterY - yOffset, {
                duration: 300,
                zoom,
              })
            }}
          />

          <DataBrowserDrawer
            open={dataBrowserOpen}
            onClose={() => setDataBrowserOpen(false)}
            engineGatewayUrl={engineGatewayState.engineGatewayUrl}
            graphName={routerState.hash.slice(1)}
          />
      </>
    ),
    [
      aboutOpen,
      allNodePrototypes,
      connectEditorInput,
      connectedEngineUrl,
      dataBrowserOpen,
      edgeDropMenuState,
      engineGatewaySettingsDialogOpen,
      engineGatewayState.engineGatewayUrl,
      envSettingsOpen,
      existingInputPortNames,
      existingOutputPortNames,
      graphEndpoint,
      handleEdgeDropPortCreated,
      handleEdgeDropView,
      nodeAddDialogOpen,
      nodeRegistry,
      nodeSearchDialogOpen,
      progressState.isActive,
      promoteRequest,
      routerState.hash,
      searchNodes,
      setEdges,
      setNodes,
      settingsMenuAnchorEl,
      themeState.scheme.isDark,
      themeStoreActions,
    ],
  )

  return (
    <NodeCatalogProvider engineGatewayUrl={connectedEngineUrl}>
      <InspectorProvider
        engineGatewayUrl={connectedEngineUrl}
        graphName={routerState.hash.slice(1) || undefined}
      >
      <InspectorBridge
        onPin={handlePinRequest}
        onPromote={handlePromoteRequest}
        availableRef={inspectorAvailableRef}
      />
      <ViewCatalogProvider engineGatewayUrl={connectedEngineUrl} builtins={BUILTIN_VIEWS}>
      <ViewPrototypesBridge
        graphEndpoint={refGraphEndpoint.current}
        editorModelUpdater={editorModelUpdaterRef.current}
        onChange={setViewPrototypes}
        catalogRef={viewCatalogRef}
      />
      <ReactFlowProvider>
        {/* <AppBar
        css={css`
          backdrop-filter: blur(16px);
          // opacity: 0.5;
        `}
        elevation={0}
      >
        <Toolbar>
          <Typography>Test</Typography>
        </Toolbar>
      </AppBar> */}
        {/* <Select><MenuItem>TEST</MenuItem></Select> */}

        <div
          css={css({
            width: "100vw",
            height: "100vh",
            // "--xy-background-color-default": surfaceColor,
          })}
        >
          <EdgeDrawingsProvider>
            <ReactFlow
              css={css({
                // "--xy-background-color-default": `${surfaceColor} !important`,
              })}
              elevateEdgesOnSelect
              minZoom={0.25}
              colorMode={themeState.scheme.isDark ? "dark" : "light"}
              nodes={nodes}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              onNodesChange={onNodeChange}
              onNodesDelete={handleNodesDeleteCb}
              edges={edges}
              onEdgesChange={onEdgeChangeFixed}
              onEdgesDelete={handleEdgesDeleteCb}
              onConnect={onConnectNode}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              snapToGrid={true}
              snapGrid={[20, 20]}
              panOnScroll
              selectionOnDrag
              panOnDrag={[1, 2]}
              selectionMode={SelectionMode.Full}
              deleteKeyCode={null}
              onInit={(instance: ReactFlowInstance) => {
                reactFlowInstanceRef.current = instance
              }}
              connectionLineComponent={EdgeConnectionLine}
            >
              <Background gap={20} variant={BackgroundVariant.Dots} />
              <Controls />
              <BreathPauser />
              <EdgeFocus />
              <ViewportPortal>
                <OriginMarker />
              </ViewportPortal>
              {/* <MiniMap nodeStrokeWidth={3} /> */}
            </ReactFlow>
          </EdgeDrawingsProvider>
        </div>
        {overlays}
        {/* Progress indicator for buildGraph and paste operations */}
        <ProgressIndicator {...progressState} delayMs={800} />
      </ReactFlowProvider>
      </ViewCatalogProvider>
      </InspectorProvider>
    </NodeCatalogProvider>
  )
}
