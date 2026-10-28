/**
 * Pure utility functions for edge / node deletion side effects.
 *
 * React Flow's onNodesDelete / onEdgesDelete callbacks fire (via deleteElements)
 * when nodes or edges are removed. The handlers here consolidate the external
 * state cleanup that must happen alongside RF's internal state updates:
 *
 *   - graph.json edges/nodes (engine state, via REST)
 *   - editor_edges entries (settings.json, via editorModelUpdater)
 *   - orphan waypoint nodes (RF state + settings.json)
 *   - residual waypoint IDs on edges when waypoints are deleted
 *
 * React hook-based handlers (onConnect, drag/select, etc.) remain in page.tsx
 * due to tight coupling with component state.
 */

import type { Edge, Node } from "@xyflow/react"
import { getEditorEdgeId } from "@/src/api/editor-model-updater"
import type { EditorModelUpdater } from "@/src/api/editor-model-updater"
import {
  getNodeType,
  graphRemoveEdge,
  graphRemoveInput,
  graphRemoveNode,
  graphRemoveOutput,
} from "@/src/api/graph-api"
import type { NodeRegistry } from "@/src/stores/node-flow-store"

/** Setter shape compatible with React Flow's setNodes / setEdges (functional form). */
type SetState<T> = (updater: (prev: T[]) => T[]) => void

/** Snackbar enqueuer (matches notistack's signature loosely). */
type EnqueueSnackbar = (msg: string, options?: object) => void

/** Parse edge source/target endpoint string into node name and port handle.
 *
 * @example
 * parseEdgeEndpoint("Stack_6.in.0") // { nodeName: "Stack_6", portHandle: "in.0" }
 * parseEdgeEndpoint("WaveGenerator_4.series") // { nodeName: "WaveGenerator_4", portHandle: "series" }
 */
export const parseEdgeEndpoint = (
  endpoint: string,
): { nodeName: string; portHandle: string } => {
  const firstDotIndex = endpoint.indexOf(".")
  if (firstDotIndex === -1) {
    return { nodeName: endpoint, portHandle: "" }
  }
  const nodeName = endpoint.substring(0, firstDotIndex)
  const portHandle = endpoint.substring(firstDotIndex + 1)
  return { nodeName, portHandle }
}

/** Generate a unique waypoint node ID. */
export function generateWaypointId(): string {
  return `$wp:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Merge radius in pixels for combining nearby waypoints. */
export const WAYPOINT_MERGE_RADIUS = 20

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getEdgeWaypointIds(edge: Edge): string[] | undefined {
  return (edge.data as Record<string, unknown>)?.waypointIds as string[] | undefined
}

function hasEditorEndpoint(edge: Edge): boolean {
  const data = edge.data as Record<string, unknown> | undefined
  const sourceType = (data?.source as { type: string } | undefined)?.type
  const targetType = (data?.target as { type: string } | undefined)?.type
  return sourceType === "editor" || targetType === "editor"
}

function persistEditorEdge(
  editorModelUrl: string,
  editorEdgeId: string,
  source: string,
  sourceHandle: string | null,
  target: string,
  targetHandle: string | null,
  waypoints: string[],
) {
  fetch(`${editorModelUrl}?query=editor_edges.${editorEdgeId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, sourceHandle, target, targetHandle, waypoints }),
  })
}

// ---------------------------------------------------------------------------
// Waypoint cleanup utilities
// ---------------------------------------------------------------------------

/**
 * Remove a single waypoint ID from all edges' waypointIds and persist changes.
 * Call this when a single waypoint is detached from one edge via the context
 * menu's "detach" action; for bulk waypoint deletion via React Flow's delete
 * cascade, use cleanupWaypointsFromEdgesBatch instead.
 */
export function cleanupWaypointFromEdges(
  waypointId: string,
  setEdges: SetState<Edge>,
  editorModelUpdater: EditorModelUpdater,
) {
  cleanupWaypointsFromEdgesBatch(
    new Set([waypointId]),
    setEdges,
    editorModelUpdater,
  )
}

/**
 * Remove a batch of waypoint IDs from all referencing edges' waypointIds and
 * persist the updated entries. Called from handleNodesDelete when one or more
 * waypoint nodes are removed (e.g. user selects multiple waypoints + nodes
 * via marquee selection and presses DEL).
 *
 * For each affected edge:
 *   - If the edge ends up with no waypoints AND has no editor endpoint, the
 *     editor_edges entry becomes redundant (engine-only edge fully described
 *     by graph.json) -> remove the entry entirely.
 *   - Otherwise (still has waypoints, OR has an editor endpoint), PUT the
 *     updated waypoints list back.
 */
export function cleanupWaypointsFromEdgesBatch(
  deletedWaypointIds: Set<string>,
  setEdges: SetState<Edge>,
  editorModelUpdater: EditorModelUpdater,
) {
  if (deletedWaypointIds.size === 0) return

  const affectedEdges: Array<{
    editorEdgeId: string
    source: string
    sourceHandle: string | null
    target: string
    targetHandle: string | null
    newWaypointIds: string[]
    hasEditorEndpoint: boolean
  }> = []

  setEdges(edges =>
    edges.map(edge => {
      const wpIds = getEdgeWaypointIds(edge)
      if (!wpIds || !wpIds.some(id => deletedWaypointIds.has(id))) return edge
      const newWpIds = wpIds.filter(id => !deletedWaypointIds.has(id))
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
        hasEditorEndpoint: hasEditorEndpoint(edge),
      })
      return { ...edge, data: { ...edge.data, waypointIds: newWpIds } }
    }),
  )

  for (const ae of affectedEdges) {
    if (ae.newWaypointIds.length === 0 && !ae.hasEditorEndpoint) {
      editorModelUpdater.removeEditorEdge(ae.editorEdgeId)
    } else {
      persistEditorEdge(
        editorModelUpdater.editorModelUrl,
        ae.editorEdgeId,
        ae.source,
        ae.sourceHandle,
        ae.target,
        ae.targetHandle,
        ae.newWaypointIds,
      )
    }
  }
}

/**
 * Remove waypoint nodes that are no longer referenced by any remaining edge.
 * Call this when edges are deleted.
 *
 * `deletedEdgeIds` is a Set for O(1) membership test (was: array.includes O(N)).
 */
export function cleanupOrphanWaypoints(
  deletedEdgeIds: Set<string>,
  edges: Edge[],
  setNodes: SetState<Node>,
  editorModelUpdater: EditorModelUpdater,
) {
  // Collect waypoint IDs from deleted edges
  const candidateWpIds = new Set<string>()
  for (const edge of edges) {
    if (!deletedEdgeIds.has(edge.id)) continue
    const wpIds = getEdgeWaypointIds(edge)
    if (wpIds) {
      for (const wpId of wpIds) candidateWpIds.add(wpId)
    }
  }
  if (candidateWpIds.size === 0) return

  // Remove waypoints still referenced by surviving edges
  for (const edge of edges) {
    if (deletedEdgeIds.has(edge.id)) continue
    const wpIds = getEdgeWaypointIds(edge)
    if (wpIds) {
      for (const wpId of wpIds) candidateWpIds.delete(wpId)
    }
  }
  if (candidateWpIds.size === 0) return

  // Delete orphan waypoints
  setNodes(nodes => nodes.filter(n => !candidateWpIds.has(n.id)))
  candidateWpIds.forEach(wpId => {
    editorModelUpdater.removeNode(wpId)
  })
}

// ---------------------------------------------------------------------------
// React Flow onEdgesDelete / onNodesDelete handlers
// ---------------------------------------------------------------------------

export interface HandleEdgesDeleteContext {
  engineGatewayUrl: string
  graphName: string
  /** All edges (pre-deletion) — needed for orphan waypoint detection. */
  edges: Edge[]
  setNodes: SetState<Node>
  editorModelUpdater: EditorModelUpdater
}

/**
 * Handle React Flow's onEdgesDelete callback (fired via deleteElements for
 * explicit edge deletions AND cascaded edges from node deletions).
 *
 * Side effects in one pass:
 *   - Engine edges: graphRemoveEdge (engine state via REST)
 *   - All edges: removeEditorEdge (settings.json editor_edges entry)
 *     - Editor edges: entry always exists -> deleted.
 *     - Engine edges: entry exists if waypoint-bearing or legacy data ->
 *       deleted; otherwise the DELETE returns 404 (silently swallowed by
 *       editor-model-updater's catch).
 *   - After: cleanupOrphanWaypoints prunes waypoint nodes no longer
 *     referenced by any surviving edge.
 */
export function handleEdgesDelete(
  deletedEdges: Edge[],
  context: HandleEdgesDeleteContext,
  enqueueSnackbar: EnqueueSnackbar,
) {
  if (deletedEdges.length === 0) return

  const deletedEdgeIds = new Set(deletedEdges.map(e => e.id))

  for (const edge of deletedEdges) {
    const data = edge.data as Record<string, unknown> | undefined
    const srcType = (data?.source as { type: string } | undefined)?.type
    const tgtType = (data?.target as { type: string } | undefined)?.type
    const isEngineEdge = srcType !== "editor" && tgtType !== "editor"

    if (isEngineEdge) {
      const sourceName = srcType === "input"
        ? `.${edge.source.slice("$input:".length)}`
        : `${edge.source}.${edge.sourceHandle}`
      const targetName = tgtType === "output"
        ? `.${edge.target.slice("$output:".length)}`
        : `${edge.target}.${edge.targetHandle}`
      graphRemoveEdge(
        context.engineGatewayUrl,
        context.graphName,
        sourceName,
        targetName,
      ).catch((err: Error) =>
        enqueueSnackbar(err.message, { variant: "error" }),
      )
    }

    const editorEdgeId = getEditorEdgeId(
      edge.source,
      edge.sourceHandle ?? null,
      edge.target,
      edge.targetHandle ?? null,
    )
    context.editorModelUpdater.removeEditorEdge(editorEdgeId)
  }

  cleanupOrphanWaypoints(
    deletedEdgeIds,
    context.edges,
    context.setNodes,
    context.editorModelUpdater,
  )
}

export interface HandleNodesDeleteContext {
  engineGatewayUrl: string
  graphName: string
  setEdges: SetState<Edge>
  nodeRegistry: NodeRegistry
  editorModelUpdater: EditorModelUpdater
}

/**
 * Handle React Flow's onNodesDelete callback (fired via deleteElements for
 * explicit node deletions).
 *
 * Dispatch per node type:
 *   - "node" (engine): graphRemoveNode then editorModelUpdater.removeNode
 *   - "input" / "output" port: graphRemove(Input|Output) then removeNode
 *   - "editor" (debug node): unregisterNode + editorModelUpdater.removeNode
 *   - "waypoint": collect IDs and batch-reconcile waypointIds on remaining
 *     edges (cleanupWaypointsFromEdgesBatch), then removeNode
 *
 * Note: connected edges of deleted engine/input/output nodes are NOT removed
 * here. React Flow's deleteElements auto-cascades them via getConnectedEdges
 * and fires onEdgesDelete (= handleEdgesDelete) before this callback. By the
 * time we reach this handler, those edges have already been processed.
 */
export function handleNodesDelete(
  deletedNodes: Node[],
  context: HandleNodesDeleteContext,
  enqueueSnackbar: EnqueueSnackbar,
) {
  if (deletedNodes.length === 0) return

  const deletedWaypointIds = new Set<string>()

  for (const node of deletedNodes) {
    const type = getNodeType(node.id)
    switch (type) {
      case "node":
        graphRemoveNode(context.engineGatewayUrl, context.graphName, node.id)
          .then(() => context.editorModelUpdater.removeNode(node.id))
          .catch((err: Error) =>
            enqueueSnackbar(err.message, { variant: "error" }),
          )
        break
      case "input": {
        const portId = node.id.slice("$input:".length)
        graphRemoveInput(context.engineGatewayUrl, context.graphName, portId)
          .then(() => context.editorModelUpdater.removeNode(node.id))
          .catch((err: Error) =>
            enqueueSnackbar(err.message, { variant: "error" }),
          )
        break
      }
      case "output": {
        const portId = node.id.slice("$output:".length)
        graphRemoveOutput(context.engineGatewayUrl, context.graphName, portId)
          .then(() => context.editorModelUpdater.removeNode(node.id))
          .catch((err: Error) =>
            enqueueSnackbar(err.message, { variant: "error" }),
          )
        break
      }
      case "editor":
        context.nodeRegistry.unregisterNode(node.id)
        context.editorModelUpdater.removeNode(node.id)
        break
      case "waypoint":
        deletedWaypointIds.add(node.id)
        context.editorModelUpdater.removeNode(node.id)
        break
    }
  }

  if (deletedWaypointIds.size > 0) {
    cleanupWaypointsFromEdgesBatch(
      deletedWaypointIds,
      context.setEdges,
      context.editorModelUpdater,
    )
  }
}
