import { Node } from "@xyflow/react"

// Re-export types for backward compatibility
export type { BasicEdge } from "@/src/types/edge-types"

// Re-export constants for backward compatibility
export {
  NODE_TYPES,
  EDGE_TYPES,
  getEngineNodeUIType,
  getEngineNodeVariant,
  makeEditorNode,
} from "@/src/constants/node-types"

// Re-export API functions for backward compatibility
export {
  getNodeType,
  fetchGraphEdges,
  fetchEditorEdges,
  graphRemoveNode,
  graphRemoveInput,
  graphRemoveOutput,
  graphAddEdge,
  graphRemoveEdge,
} from "@/src/api/graph-api"

/**
 * Creates a node registry for managing editor nodes.
 * The registry tracks registered nodes and provides collision-safe registration.
 */
export function createNodeRegistry() {
  const nodeDict: Map<string, { nodeData: Node }> = new Map()

  return {
    /**
     * Registers an editor node in the registry.
     * The node ID should be pre-generated using generateEditorNodeId().
     *
     * If a collision occurs (extremely rare with UUID-style IDs),
     * a fallback suffix is added to ensure uniqueness.
     *
     * @param node - The node to register
     * @returns The registered node (with potentially modified ID on collision)
     */
    registerEditorNode(node: Node) {
      let nodeId = node.id

      // Fallback collision handling (should rarely occur with UUID-style IDs)
      if (nodeDict.has(nodeId)) {
        const fallbackSuffix =
          Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
        nodeId = `${node.id}_${fallbackSuffix}`
        console.warn(
          `Node ID collision detected for "${node.id}", using fallback: "${nodeId}"`
        )
      }

      node.id = nodeId
      nodeDict.set(nodeId, { nodeData: node })
      return node
    },

    unregisterNode(nodeId: string) {
      nodeDict.delete(nodeId)
    },

    hasNode(nodeId: string) {
      return nodeDict.has(nodeId)
    },

    getNode(nodeId: string) {
      return nodeDict.get(nodeId)?.nodeData
    },
  }
}

export type NodeRegistry = ReturnType<typeof createNodeRegistry>
