/**
 * Pure utility functions for clipboard (copy/paste) handling.
 * React hook-based handlers remain in page.tsx due to tight coupling with component state.
 */

/** Strip paste suffix (timestamp+random in base36) from port names to prevent accumulation.
 * generateUniqueSuffix() produces ~14-15 chars of [0-9a-z]. Match "_" + 12-16 base36 chars at end. */
const PASTE_SUFFIX_PATTERN = /_[0-9a-z]{12,16}$/

export function stripPasteSuffix(name: string): string {
  return name.replace(PASTE_SUFFIX_PATTERN, "")
}

/**
 * Filter an edge's waypoint IDs down to only those also included in the
 * copied selection. Waypoints outside the selection are dropped so the
 * clipboard never carries references to IDs that won't be created on paste.
 *
 * Returns an empty array (not undefined) when there are no in-selection
 * waypoints — callers decide whether to omit the field entirely.
 */
export function filterWaypointsInSelection(
  edgeWaypointIds: string[] | undefined,
  selectedNodeIds: Set<string>,
): string[] {
  if (!edgeWaypointIds || edgeWaypointIds.length === 0) return []
  return edgeWaypointIds.filter(id => selectedNodeIds.has(id))
}

/**
 * Map a clipboard edge's waypoint IDs (from the source graph) to the freshly
 * generated IDs in the paste graph using nameMapping (old -> new). IDs
 * missing from nameMapping are silently dropped — these correspond to
 * waypoints the serialize step already filtered out (defense in depth).
 */
export function mapClipboardWaypoints(
  clipboardWaypoints: string[] | undefined,
  nameMapping: Map<string, string>,
): string[] {
  if (!clipboardWaypoints || clipboardWaypoints.length === 0) return []
  const mapped: string[] = []
  for (const oldId of clipboardWaypoints) {
    const newId = nameMapping.get(oldId)
    if (newId !== undefined) mapped.push(newId)
  }
  return mapped
}
