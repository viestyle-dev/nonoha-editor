/**
 * Editor Model Updater
 *
 * Provides functions for updating editor-specific data (node positions, sizes,
 * editor edges, etc.) that are stored separately from the engine graph data.
 */

/**
 * Generates a unique edge ID for editor edges.
 *
 * Dots in handle names (e.g. indexed ports like `in.0`) are replaced with `:`
 * so that the resulting key never contains dots.  The engine settings API splits
 * query paths on `.`, so a dot inside the key would break persistence.
 */
export function getEditorEdgeId(
  source: string,
  sourceHandle: string | null,
  target: string,
  targetHandle: string | null
): string {
  const safeSourceHandle = sourceHandle?.replaceAll(".", ":") ?? null
  const safeTargetHandle = targetHandle?.replaceAll(".", ":") ?? null
  const sourceKey = safeSourceHandle
    ? `${source}:${safeSourceHandle}`
    : `${source}`
  const targetKey = safeTargetHandle
    ? `${target}:${safeTargetHandle}`
    : `${target}`
  return `${sourceKey}-${targetKey}`
}

/**
 * Creates an editor model updater that manages editor-specific state.
 * Uses a promise chain to ensure operations are executed sequentially.
 *
 * @param engineGatewayUrl - The URL of the engine gateway
 * @param groupName - The name of the graph group
 * @returns An object with methods to update editor model data
 */
export function makeEditorModelUpdater(
  engineGatewayUrl: string,
  groupName: string
) {
  const editorModelUrl = `http://${engineGatewayUrl}/node-flow/graphs/${groupName}/editors/nonoha-editor/models/settings`

  let promiseChain = Promise.resolve()

  return {
    updateNodePosition(nodeName: string, x: number, y: number) {
      promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=nodes.${nodeName}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x, y }),
          })
        )
        .then(() => {})
        .catch(error => {
          console.log(error)
        })
    },

    updateNodeSize(nodeName: string, width: number, height: number) {
      promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=nodes.${nodeName}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ width, height }),
          })
        )
        .then(() => {})
        .catch(error => {
          console.log(error)
        })
    },

    addEditorNode(nodeName: string, type: string, x: number, y: number) {
      promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=nodes.${nodeName}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, x, y }),
          })
        )
        .then(() => {})
        .catch(error => {
          console.log(error)
        })
    },

    removeNode(nodeName: string) {
      promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=nodes.${nodeName}`, {
            method: "DELETE",
          })
        )
        .then(() => {})
        .catch(error => {
          console.log(error)
        })
    },

    addEditorEdge(
      edgeId: string,
      source: string,
      sourceHandle: string | null,
      target: string,
      targetHandle: string | null,
      waypoints: string[] = []
    ) {
      promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=editor_edges.${edgeId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source,
              sourceHandle,
              target,
              targetHandle,
              waypoints,
            }),
          })
        )
        .then(() => {})
        .catch(error => {
          console.log(error)
        })
    },

    removeEditorEdge(edgeId: string) {
      promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=editor_edges.${edgeId}`, {
            method: "DELETE",
          })
        )
        .then(() => {})
        .catch(error => {
          console.log(error)
        })
    },

    async getNodeData(nodeId: string): Promise<Record<string, unknown>> {
      return (promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=nodes.${nodeId}.data`, {
            method: "GET",
          })
        )
        .then(response => response.json())
        .catch(error => {
          console.error(error)
          throw error
        }))
    },

    patchNodeData(nodeId: string, data: Record<string, unknown>) {
      // Convert undefined → null so JSON.stringify includes them.
      // Without this, cleared optional fields (e.g. yMin=undefined) are
      // silently dropped and the server's PATCH keeps the old value.
      const sanitized = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v ?? null])
      )
      promiseChain = promiseChain
        .then(() =>
          fetch(`${editorModelUrl}?query=nodes.${nodeId}.data`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sanitized),
          })
        )
        .then(() => {})
        .catch(error => {
          console.log(error)
        })
    },

    editorModelUrl,
  }
}

export type EditorModelUpdater = ReturnType<typeof makeEditorModelUpdater>
