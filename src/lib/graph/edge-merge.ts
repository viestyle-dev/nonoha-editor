import { Edge } from "@xyflow/react"
import type { BasicEdge } from "@/src/types/edge-types"

/** Data fields preserved from existing edges during merge. */
type PreservedData = {
  waypointIds?: string[]
  editorModelUrl?: string
}

/** Canonical key for matching edges by connection endpoints. */
function edgeConnectionKey(edge: Edge): string {
  return `${edge.source}|${edge.sourceHandle ?? ""}|${edge.target}|${edge.targetHandle ?? ""}`
}

/** Check if an edge is an editor-only edge (not from the engine). */
function isEditorEdge(edge: Edge): boolean {
  const data = edge.data as Record<string, unknown> | undefined
  if (!data?.source) return false
  const sourceType = (data as { source: { type: string } }).source.type
  const targetType = (data as { target: { type: string } }).target.type
  return sourceType === "editor" || targetType === "editor"
}

/**
 * Merges fresh engine edges with current edges, preserving editor-only
 * edge data (waypointIds, editorModelUrl) that would otherwise be lost.
 *
 * - Engine edges: use fresh data, but carry over preserved fields from
 *   any matching existing edge.
 * - Editor edges (not in fresh set): kept as-is.
 * - Stale engine edges (in current but not in fresh): removed.
 */
export function mergeEngineEdges(
  currentEdges: Edge[],
  freshEngineEdges: BasicEdge[],
): Edge[] {
  // Build lookup of preserved data from current edges
  const preservedLookup = new Map<string, PreservedData>()
  for (const edge of currentEdges) {
    const data = edge.data as Record<string, unknown> | undefined
    const waypointIds = data?.waypointIds as string[] | undefined
    const editorModelUrl = data?.editorModelUrl as string | undefined
    if (waypointIds || editorModelUrl) {
      preservedLookup.set(edgeConnectionKey(edge), { waypointIds, editorModelUrl })
    }
  }

  const freshIds = new Set(freshEngineEdges.map(e => e.id))

  // Merge preserved data into fresh engine edges
  const mergedEngineEdges: Edge[] = freshEngineEdges.map(fresh => {
    const preserved = preservedLookup.get(edgeConnectionKey(fresh))
    if (!preserved) return fresh
    return {
      ...fresh,
      data: {
        ...fresh.data,
        ...(preserved.waypointIds && { waypointIds: preserved.waypointIds }),
        ...(preserved.editorModelUrl && { editorModelUrl: preserved.editorModelUrl }),
      },
    }
  })

  // Keep editor edges that are not replaced by engine edges
  const keptEditorEdges = currentEdges.filter(
    edge => !freshIds.has(edge.id) && isEditorEdge(edge),
  )

  return [...keptEditorEdges, ...mergedEngineEdges]
}
