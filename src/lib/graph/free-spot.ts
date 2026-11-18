export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  )
}

/**
 * Top-left position for a new node of `size` near `preferred` that does not
 * overlap `occupied` (absolute flow coordinates). Searches downward from the
 * preferred spot, then in further columns to the right.
 */
export function findFreeSpot(
  preferred: { x: number; y: number },
  size: { width: number; height: number },
  occupied: readonly Rect[],
  { step = 20, margin = 20, columns = 6, rows = 40, columnWidth = size.width + 40 } = {},
): { x: number; y: number } {
  for (let c = 0; c < columns; ++c) {
    for (let r = 0; r < rows; ++r) {
      const candidate = { x: preferred.x + c * columnWidth, y: preferred.y + r * step, ...size }
      if (!occupied.some(o => rectsOverlap(candidate, o, margin))) return { x: candidate.x, y: candidate.y }
    }
  }
  return preferred
}
