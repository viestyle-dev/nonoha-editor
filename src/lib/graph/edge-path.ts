/**
 * Edge path calculation utilities.
 * Pure functions for SVG path generation — no React dependencies.
 */

export interface Point {
  x: number
  y: number
}

/** A waypoint's diameter. Its node's origin is its center: the position is where edges pass. */
export const WAYPOINT_SIZE = 18

/** Where edges pass a waypoint, from its node's top-left (React Flow's positionAbsolute). */
export function waypointCenter(topLeft: Point): Point {
  return { x: topLeft.x + WAYPOINT_SIZE / 2, y: topLeft.y + WAYPOINT_SIZE / 2 }
}

export function samePoints(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false
  }
  return true
}

/** Straight run out of an output and into an input. */
const LEAD = 16
/** Corner rounding. */
const RADIUS = 10
/** How far a backward segment with little rise loops below its lower end. */
const LOOP = 40

/**
 * The corners of one segment, from an output side (leaving rightward) to an
 * input side (entering rightward), on 0°, 45° and 90° only, as circuit boards
 * and metro maps draw: lines of one direction run as parallel bands and
 * crossings are at 45° or 90°. Measured on a real graph against the former
 * curve (a horizontal lead, then nearly straight at whatever angle the ends
 * give): shallow crossings (under 30°) fell from 26% to 3%; right angles only
 * stacked vertical runs on one another (11% of the length). The shape depends
 * only on the two ends: no routing around nodes.
 *
 * - The rise is taken by one 45° run in the middle of the segment.
 * - A rise larger than the run turns 45°, goes vertical, and turns back.
 * - A segment going back left loops around in a U.
 */
export function segmentCorners(from: Point, to: Point): Point[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const rise = Math.abs(dy)
  const sign = dy < 0 ? -1 : 1
  if (dx < 2 * LEAD) {
    const y = rise >= 4 * RADIUS ? (from.y + to.y) / 2 : Math.max(from.y, to.y) + LOOP
    return [from, { x: from.x + LEAD, y: from.y }, { x: from.x + LEAD, y }, { x: to.x - LEAD, y }, { x: to.x - LEAD, y: to.y }, to]
  }
  if (rise <= dx - 2 * LEAD) {
    const x = from.x + (dx - rise) / 2
    return [from, { x, y: from.y }, { x: x + rise, y: to.y }, to]
  }
  const run = (dx - 2 * LEAD) / 2
  return [
    from,
    { x: from.x + LEAD, y: from.y },
    { x: from.x + LEAD + run, y: from.y + sign * run },
    { x: from.x + LEAD + run, y: to.y - sign * run },
    { x: to.x - LEAD, y: to.y },
    to,
  ]
}

/** An SVG path through `corners`, each corner rounded (never more than half of either side). */
function roundedPath(corners: Point[]): string {
  const points = corners.filter((p, i) => i === 0 || Math.hypot(p.x - corners[i - 1].x, p.y - corners[i - 1].y) > 0.5)
  let path = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const at = points[i]
    const next = points[i + 1]
    const inLength = Math.hypot(at.x - prev.x, at.y - prev.y)
    const outLength = Math.hypot(next.x - at.x, next.y - at.y)
    const r = Math.min(RADIUS, inLength / 2, outLength / 2)
    const enter = { x: at.x - ((at.x - prev.x) / inLength) * r, y: at.y - ((at.y - prev.y) / inLength) * r }
    const leave = { x: at.x + ((next.x - at.x) / outLength) * r, y: at.y + ((next.y - at.y) / outLength) * r }
    path += ` L ${enter.x},${enter.y} Q ${at.x},${at.y} ${leave.x},${leave.y}`
  }
  const last = points[points.length - 1]
  return `${path} L ${last.x},${last.y}`
}

/** SVG path through source → waypoints → target: one segment per pair (segmentCorners), corners rounded. */
export function buildEdgePath(source: Point, target: Point, waypoints: Point[]): string {
  const allPoints = [source, ...waypoints, target]
  let corners: Point[] = [source]
  for (let i = 0; i < allPoints.length - 1; i++) {
    corners = corners.concat(segmentCorners(allPoints[i], allPoints[i + 1]).slice(1))
  }
  return roundedPath(corners)
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
