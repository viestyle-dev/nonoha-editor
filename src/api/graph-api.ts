import type { BasicEdge } from "@/src/types/edge-types"

/**
 * Determines the node type based on its ID prefix.
 */
export function getNodeType(
  nodeName: string
): "input" | "output" | "editor" | "waypoint" | "node" {
  if (nodeName.startsWith("$input:")) {
    return "input"
  }
  if (nodeName.startsWith("$output:")) {
    return "output"
  }
  if (nodeName.startsWith("$editor:")) {
    return "editor"
  }
  if (nodeName.startsWith("$wp:")) {
    return "waypoint"
  }
  return "node"
}

/**
 * Fetches graph edges from the engine API and transforms them to React Flow format.
 */
export async function fetchGraphEdges(
  engineGatewayUrl: string,
  graphName: string
): Promise<BasicEdge[]> {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/edges`
  )
  const edgesData: { source: string; target: string; valid?: boolean }[] =
    await response.json()

  return edgesData.map(edge => {
    const [sourceNode, ...sourcePortParts] = edge.source.split(".")
    const [targetNode, ...targetPortParts] = edge.target.split(".")
    const valid = edge.valid ?? true

    if (sourceNode !== "" && targetNode !== "") {
      // Node to Node
      return {
        id: `${edge.source}-${edge.target}`,
        source: sourceNode,
        sourceHandle: sourcePortParts.join("."),
        target: targetNode,
        targetHandle: targetPortParts.join("."),
        type: "BasicNodeEdge",
        zIndex: -2,
        data: {
          source: { type: "node" },
          target: { type: "node" },
          valid,
        },
      } as BasicEdge
    } else if (sourceNode !== "" && targetNode === "") {
      // Node to Output
      return {
        id: `${edge.source}-${edge.target}`,
        source: sourceNode,
        sourceHandle: sourcePortParts.join("."),
        target: `$output:${targetPortParts.join(".")}`,
        type: "BasicNodeEdge",
        zIndex: -2,
        data: {
          source: { type: "node" },
          target: { type: "output" },
          valid,
        },
      } as BasicEdge
    } else if (sourceNode === "" && targetNode !== "") {
      // Input to Node
      return {
        id: `${edge.source}-${edge.target}`,
        source: `$input:${sourcePortParts.join(".")}`,
        target: targetNode,
        targetHandle: targetPortParts.join("."),
        type: "BasicNodeEdge",
        zIndex: -2,
        data: {
          source: { type: "input" },
          target: { type: "node" },
          valid,
        },
      } as BasicEdge
    }

    throw new Error("Invalid edge")
  })
}

/**
 * Fetches editor-specific edges from the settings API.
 */
export async function fetchEditorEdges(
  engineGatewayUrl: string,
  graphName: string
): Promise<BasicEdge[]> {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/editors/nonoha-editor/models/settings?query=editor_edges`
  )
  const editorEdgesSettings: {
    [key: string]: {
      source: string
      target: string
      sourceHandle: string | null
      targetHandle: string | null
      waypoints?: string[]
    }
  } = await response.json()

  if (!editorEdgesSettings) {
    return []
  }

  return Object.entries(editorEdgesSettings).map(([key, settings]) => ({
    id: key,
    source: settings.source,
    target: settings.target,
    sourceHandle: settings.sourceHandle,
    targetHandle: settings.targetHandle,
    type: "BasicNodeEdge",
    zIndex: -2,
    data: {
      source: { type: getNodeType(settings.source) },
      target: { type: getNodeType(settings.target) },
      waypointIds: settings.waypoints,
    },
  }))
}

/**
 * Removes a node from the graph.
 */
export async function graphRemoveNode(
  engineGatewayUrl: string,
  graphName: string,
  nodeId: string
): Promise<void> {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: "DELETE" }
  )
  if (response.ok || response.status === 404) {
    return
  }
}

/**
 * Removes an input port from the graph.
 */
export async function graphRemoveInput(
  engineGatewayUrl: string,
  graphName: string,
  inputId: string
): Promise<void> {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/inputs/${encodeURIComponent(inputId)}`,
    { method: "DELETE" }
  )
  if (response.ok || response.status === 404) {
    return
  }
}

/**
 * Removes an output port from the graph.
 */
export async function graphRemoveOutput(
  engineGatewayUrl: string,
  graphName: string,
  outputId: string
): Promise<void> {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/outputs/${encodeURIComponent(outputId)}`,
    { method: "DELETE" }
  )
  if (response.ok || response.status === 404) {
    return
  }
}

/**
 * Adds an edge to the graph.
 */
export async function graphAddEdge(
  engineGatewayUrl: string,
  graphName: string,
  source: string,
  target: string
): Promise<void> {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/edges`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, target }),
    }
  )
  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }
}

/**
 * Removes an edge from the graph.
 */
export async function graphRemoveEdge(
  engineGatewayUrl: string,
  graphName: string,
  source: string,
  target: string
): Promise<void> {
  const response = await fetch(
    `http://${engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/edges/${encodeURIComponent(source)}-${encodeURIComponent(target)}`,
    { method: "DELETE" }
  )
  if (response.status === 404) {
    return
  }
  if (!response.ok) {
    const error = await response.text()
    throw new Error(error)
  }
}
