/**
 * ID generation utilities for editor nodes
 *
 * This module provides a unified approach to generating unique IDs for editor nodes,
 * designed to work safely in multi-editor environments.
 *
 * Key design decisions:
 * - Uses timestamp + random suffix for low collision probability
 * - No global counter to avoid race conditions between multiple editors
 * - Collision handling is delegated to the registry (fallback mechanism)
 *
 * ## Collision Probability Reference (Birthday Paradox)
 *
 * | Random Chars | Combinations (M) | 50% Collision | 0.1% Collision |
 * |--------------|------------------|---------------|----------------|
 * | 1            | 36               | 7             | 1              |
 * | 2            | 1,296            | 42            | 2              |
 * | 3            | 46,656           | 254           | 10             |
 * | 4            | 1,679,616        | 1,524         | 58             |
 * | 5            | 60,466,176       | 9,145         | 348            |
 * | 6            | 2,176,782,336    | 54,872        | 2,087          |
 * | 7            | 78,364,164,096   | 329,233       | 12,522         |
 * | 8            | 2.82 trillion    | 1,975,398     | 75,134         |
 *
 * Formula: 50% collision ≈ 1.177 × √M
 *
 * Current implementation uses:
 * - Timestamp (lower 8-9 chars): Cycles every ~28 minutes, ensures uniqueness within cycle
 * - Random (6 chars): 2.18 billion combinations, 50% collision at ~55K IDs
 * - Total: ~14-15 characters, extremely low collision probability
 */

/**
 * Generates a unique suffix using timestamp and random characters.
 *
 * Format: base36(timestamp) + base36(random)
 * Length: ~14-15 characters (8-9 timestamp + 6 random)
 * Example: "m2k9x3f1abc123"
 *
 * Collision behavior:
 * - Within 28 minutes: Timestamp ensures uniqueness (except same millisecond)
 * - Same millisecond: Random 6 chars provide 1/2.18B collision probability
 * - After 28 minutes: Timestamp cycles, but random still protects
 */
export function generateUniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

/**
 * Generates a unique editor node ID.
 * Format: $editor:{nodeType}_{uniqueSuffix}
 * Example: "$editor:CommentNode_lxyz123abc"
 *
 * @param nodeType - The type of editor node (e.g., "CommentNode", "TriggerNode")
 * @returns A unique editor node ID with the $editor: prefix
 */
export function generateEditorNodeId(nodeType: string): string {
  const uniqueSuffix = generateUniqueSuffix()
  return `$editor:${nodeType}_${uniqueSuffix}`
}

/**
 * Extracts the node type from an editor node ID.
 * Example: "$editor:CommentNode_lxyz123abc" -> "CommentNode"
 *
 * @param editorNodeId - The full editor node ID
 * @returns The node type portion, or null if not a valid editor node ID
 */
export function extractNodeTypeFromId(editorNodeId: string): string | null {
  if (!editorNodeId.startsWith("$editor:")) {
    return null
  }

  const withoutPrefix = editorNodeId.slice("$editor:".length)
  const underscoreIndex = withoutPrefix.lastIndexOf("_")

  if (underscoreIndex === -1) {
    return withoutPrefix
  }

  return withoutPrefix.slice(0, underscoreIndex)
}
