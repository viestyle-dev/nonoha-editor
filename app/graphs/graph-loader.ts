import { Node, Edge } from "@xyflow/react"
import {
  GraphEndpoint,
  makeGraphEndpoint,
} from "nonoha-client-js"
import {
  makeEditorModelUpdater,
  type EditorModelUpdater,
} from "@/src/api/editor-model-updater"
import {
  BasicEdge,
  fetchEditorEdges,
  fetchGraphEdges,
  getEngineNodeUIType,
  getEngineNodeVariant,
  makeEditorNode,
  type NodeRegistry,
} from "@/src/stores/node-flow-store"
import { enqueueSnackbar } from "notistack"
import { SnackbarActionPromptReload } from "@/src/components/snackbar-actions"
import { mergeEngineEdges } from "@/src/lib/graph/edge-merge"

export type ProgressCallback = (
  current: number,
  total: number,
  message?: string
) => void

export const buildGraph = async (
  engineGatewayUrl: string,
  graphName: string,
  nodeRegistry: NodeRegistry,
  graphEditDisabled = false,
  onProgress?: ProgressCallback,
): Promise<
  | {
      nodes: Node[]
      edges: BasicEdge[]
      graphEndpoint: GraphEndpoint
      editorModelUpdater: EditorModelUpdater
    }
  | undefined
> => {
  if (graphName == "" || engineGatewayUrl == "") {
    return undefined
  }

  const graphEndpoint = makeGraphEndpoint(engineGatewayUrl, graphName)
  const editorModelUpdater = makeEditorModelUpdater(engineGatewayUrl, graphName)

  graphEndpoint.addClosedCallback((wasClean) => {
    // 意図的な切断（wasClean=true）の場合は通知しない
    if (wasClean) {
      return
    }
    enqueueSnackbar("Graph Endpoint Closed", {
      variant: "error",
      persist: true,
      action: SnackbarActionPromptReload,
      anchorOrigin: {
        vertical: "bottom",
        horizontal: "center",
      },
    })
  })

  try {
    // 進捗追跡用
    let step = 0

    const nodeNames: string[] = await (
      await fetch(
        `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/nodes`
      )
    ).json()

    // 総ステップ数: 3(初期fetch) + N(ノード数) + 3(後続fetch) = 6 + N
    const totalSteps = 6 + nodeNames.length
    step++
    onProgress?.(step, totalSteps, "Loading settings...")

    const nodesSettings: {
      [key: string]: {
        x?: number
        y?: number
        width?: number
        height?: number
        type?: string
        data?: Record<string, unknown>
      }
    } = await (
      await fetch(
        `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/editors/nonoha-editor/models/settings?query=nodes`
      )
    ).json()
    step++
    onProgress?.(step, totalSteps, "Loading properties...")

    const graphProperties: {
      [key: string]: string | number | boolean
    } = await (
      await fetch(
        `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/properties`
      )
    ).json()
    step++
    onProgress?.(step, totalSteps, "Loading nodes...")

    const graphNode = {
      id: "$graph",
      type: "GraphNode",
      position: {
        x: nodesSettings?.["$graph"]?.x ?? 20,
        y: nodesSettings?.["$graph"]?.y ?? 20,
      },
      style: {
        width: nodesSettings?.["$graph"]?.width ?? 640,
        height: nodesSettings?.["$graph"]?.height ?? 480,
      },
      data: {
        label: graphName,
        editorModelUpdater,
        graphEditDisabled,
        graphProperties,
        graphEndpoint: graphEndpoint,
      },
      zIndex: -1,
      draggable: false,
      selectable: false,
    }

    const nodes = graphEditDisabled
      ? []
      : await nodeNames.reduce(async (promise, name, index) => {
          const arr = await promise
          const nodeData = await (
            await fetch(
              `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${name}`
            )
          ).json()
          step++
          onProgress?.(
            step,
            totalSteps,
            `Loading nodes... (${index + 1}/${nodeNames.length})`
          )
          const settings = nodesSettings?.[name]
          arr.push({
            id: name,
            data: {
              label: name,
              variant: getEngineNodeVariant(nodeData.type),
              nodeData: nodeData,
              graphEndpoint: graphEndpoint,
            },
            position: { x: settings?.x ?? 240, y: settings?.y ?? 100 },
            type: getEngineNodeUIType(nodeData.type),
            dragHandle: ".drag-handle",
            parentId: "$graph",
          })
          return arr
        }, Promise.resolve([] as Node[]))

    const inputs: {
      name: string
      values: {
        type: string
      }[]
    }[] = await (
      await fetch(
        `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/inputs`
      )
    ).json()
    step++
    onProgress?.(step, totalSteps, "Loading outputs...")
    const inputNodes = inputs.map(input => {
      const settings = nodesSettings?.[`$input:${input.name}`]
      return {
        id: `$input:${input.name}`,
        data: { label: input.name, port: input, graphEditDisabled },
        position: { x: settings?.x ?? 100, y: settings?.y ?? 100 },
        type: "BasicPortNode",
        dragHandle: ".drag-handle",
        parentId: "$graph",
        draggable: graphEditDisabled ? false : true,
        selectable: graphEditDisabled ? false : true,
      }
    })

    const outputs: {
      name: string
      type: string
    }[] = await (
      await fetch(
        `http://${engineGatewayUrl}/node-flow/graphs/${graphName}/outputs`
      )
    ).json()
    step++
    onProgress?.(step, totalSteps, "Loading edges...")
    const outputNodes = outputs.map(output => {
      const settings = nodesSettings?.[`$output:${output.name}`]
      return {
        id: `$output:${output.name}`,
        data: { label: output.name, port: output, graphEditDisabled },
        position: { x: settings?.x ?? 500, y: settings?.y ?? 100 },
        type: "BasicPortNode",
        dragHandle: ".drag-handle",
        parentId: "$graph",
        draggable: graphEditDisabled ? false : true,
        selectable: graphEditDisabled ? false : true,
      }
    })

    const editorNodes = Object.keys(nodesSettings ?? {})
      .filter(key => key.startsWith("$editor:"))
      .map(nodeName => {
        const settings = nodesSettings?.[nodeName]

        // Only apply style if explicit width and height are present
        const hasSize = settings.width && settings.height

        const node = makeEditorNode({
          id: nodeName,
          data: {
            nodeData: settings.data,
            label: nodeName,
            graphEndpoint: graphEndpoint,
            editorModelUpdater,
          },
          position: { x: settings.x ?? 100, y: settings.y ?? 100 },
          style: hasSize
            ? {
                width: settings.width,
                height: settings.height,
              }
            : undefined,
          dragHandle: ".drag-handle",
          type: settings.type ?? "default",
        } as Node)
        nodeRegistry.registerEditorNode(node)
        return node
      })

    // Load waypoint nodes from settings
    const waypointNodes = Object.keys(nodesSettings ?? {})
      .filter(key => key.startsWith("$wp:"))
      .map(wpId => {
        const settings = nodesSettings?.[wpId]
        return {
          id: wpId,
          type: "WaypointNode",
          position: { x: settings?.x ?? 0, y: settings?.y ?? 0 },
          parentId: "$graph",
          data: {},
          zIndex: 2000,
        } as Node
      })

    const edges = await fetchGraphEdges(engineGatewayUrl, graphName)

    const editorEdges = await fetchEditorEdges(engineGatewayUrl, graphName)

    step++
    onProgress?.(step, totalSteps, "Connecting...")

    graphEndpoint.connect()

    // Merge editor edge waypoint IDs into engine edges, deduplicate
    const url = editorModelUpdater.editorModelUrl

    // Build lookup: connection key → waypointIds from editor edges
    const editorWaypointLookup = new Map<string, string[]>()
    for (const ee of editorEdges) {
      const key = `${ee.source}|${ee.sourceHandle ?? ""}|${ee.target}|${ee.targetHandle ?? ""}`
      if (ee.data?.waypointIds?.length) {
        editorWaypointLookup.set(key, ee.data.waypointIds)
      }
    }

    // Merge waypointIds into engine edges, attach editorModelUrl
    const mergedEdges: BasicEdge[] = edges.map(edge => {
      const key = `${edge.source}|${edge.sourceHandle ?? ""}|${edge.target}|${edge.targetHandle ?? ""}`
      const wpIds = editorWaypointLookup.get(key)
      const data = edge.data!
      data.editorModelUrl = url
      if (wpIds) {
        data.waypointIds = wpIds
        editorWaypointLookup.delete(key)
      }
      return edge
    })

    // Add remaining editor-only edges (not duplicates of engine edges)
    const engineEdgeKeys = new Set(
      edges.map(e => `${e.source}|${e.sourceHandle ?? ""}|${e.target}|${e.targetHandle ?? ""}`)
    )
    for (const ee of editorEdges) {
      const key = `${ee.source}|${ee.sourceHandle ?? ""}|${ee.target}|${ee.targetHandle ?? ""}`
      if (!engineEdgeKeys.has(key)) {
        const data = ee.data!
        data.editorModelUrl = url
        mergedEdges.push(ee)
      }
    }

    const allEdges = mergedEdges

    return {
      nodes: [
        graphNode,
        ...nodes,
        ...inputNodes,
        ...outputNodes,
        ...editorNodes,
        ...waypointNodes,
      ],
      edges: allEdges,
      graphEndpoint,
      editorModelUpdater,
    }
  } catch (error) {
    console.error(error)
    enqueueSnackbar(`${error}`, { variant: "error" })
    return undefined
  }
}

/**
 * Lightweight graph refresh: re-fetches node data and edges sequentially,
 * keeping positions and WS connection intact.
 */
export const refreshGraph = async (
  engineGatewayUrl: string,
  graphName: string,
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void,
  onProgress?: ProgressCallback,
) => {
  // 1. Get node names
  const nodeNames: string[] = await (
    await fetch(
      `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/nodes`
    )
  ).json()

  const totalSteps = nodeNames.length + 1 // N nodes + 1 edge fetch

  // 2. Fetch each node's data sequentially (minimize server load)
  const nodeDataMap: Record<string, unknown> = {}
  for (let i = 0; i < nodeNames.length; i++) {
    const name = nodeNames[i]
    onProgress?.(i + 1, totalSteps, `Refreshing nodes... (${i + 1}/${nodeNames.length})`)
    nodeDataMap[name] = await (
      await fetch(
        `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/nodes/${encodeURIComponent(name)}`
      )
    ).json()
  }

  // 3. Fetch edges
  onProgress?.(totalSteps, totalSteps, "Refreshing edges...")
  const freshEdges = await fetchGraphEdges(engineGatewayUrl, graphName)

  // 4. Apply: update nodeData while preserving positions
  setNodes(nodes =>
    nodes.map(node => {
      const newData = nodeDataMap[node.id]
      if (!newData) return node // editor/graph nodes unchanged
      return {
        ...node,
        data: {
          ...node.data,
          nodeData: newData,
          variant: getEngineNodeVariant((newData as { type: string }).type),
        },
      }
    })
  )

  // 5. Replace engine edges, keep editor edges — preserve waypointIds + editorModelUrl
  setEdges(currentEdges => mergeEngineEdges(currentEdges, freshEdges))
}
