/**
 * Edge path calculation utilities.
 * Pure functions for SVG path generation — no React dependencies.
 */

export interface Point {
  x: number
  y: number
}

/** Build a cubic bezier segment between two points with horizontal control offsets. */
export function bezierSegment(from: Point, to: Point, baseOffset = 32): string {
  const dx = to.x - from.x
  const distance = Math.sqrt(dx * dx + (to.y - from.y) ** 2)
  const controlOffset = distance < baseOffset ? Math.abs(dx) * 0.5 : baseOffset
  return `C ${from.x + controlOffset},${from.y} ${to.x - controlOffset},${to.y} ${to.x},${to.y}`
}

/** Build SVG path through source → waypoints → target using cubic bezier segments. */
export function buildEdgePath(source: Point, target: Point, waypoints: Point[]): string {
  const allPoints = [source, ...waypoints, target]
  let path = `M ${allPoints[0].x},${allPoints[0].y}`
  for (let i = 0; i < allPoints.length - 1; i++) {
    path += ` ${bezierSegment(allPoints[i], allPoints[i + 1])}`
  }
  return path
}

/** Find the midpoint of the edge path (considering waypoints). */
export function edgeMidpoint(source: Point, target: Point, waypoints: Point[]): Point {
  const allPoints = [source, ...waypoints, target]
  const midSegment = Math.floor((allPoints.length - 1) / 2)
  return {
    x: (allPoints[midSegment].x + allPoints[midSegment + 1].x) / 2,
    y: (allPoints[midSegment].y + allPoints[midSegment + 1].y) / 2,
  }
}

/**
 * Find the best insertion index for a new waypoint at (px, py)
 * among the existing path points [source, ...waypoints, target].
 */
export function findInsertionIndex(
  px: number,
  py: number,
  source: Point,
  target: Point,
  waypoints: Point[],
): number {
  const allPoints = [source, ...waypoints, target]
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < allPoints.length - 1; i++) {
    const mx = (allPoints[i].x + allPoints[i + 1].x) / 2
    const my = (allPoints[i].y + allPoints[i + 1].y) / 2
    const d = (px - mx) ** 2 + (py - my) ** 2
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}
