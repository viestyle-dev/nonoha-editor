/**
 * The grid of a graph: one unit for how nodes are built and for where they sit,
 * so that lining them up takes no pixel work.
 *
 * - ROW is the height of a port row. A node's first row starts two rows below
 *   its top (PORTS_TOP) and every row below it is a whole number of rows
 *   further, so each port's center is ROW / 2 + k * ROW below the node's top.
 *   A waypoint is one row across, its center likewise. The background dots are
 *   on the same lines.
 * - SNAP is the step of positions. React Flow puts a node's top-left on it
 *   while the node is dragged (a multi-selection as one piece); a position the
 *   editor makes itself (a new node, a paste, a waypoint) is put on it with the
 *   functions below.
 *
 * With every top on the grid, ports of the same row join with a straight line
 * and ports of different rows are whole rows apart, whatever the nodes are.
 *
 * SNAP has to divide ROW. Equal to it (as now), a node's rows are on the row
 * lines wherever it is put. A finer step (10, 5) keeps the stored positions
 * valid and the ports on the grid, but allows a node between two row lines:
 * lining up is then up to the user again. Inside a row, sizes are multiples
 * of 4 (paddings 4 and 8, handles 16 and 12).
 */

import type { Point } from "./edge-path"

export const ROW = 20

export const SNAP = ROW

/** React Flow's `snapGrid`. */
export const SNAP_GRID: [number, number] = [SNAP, SNAP]

/** Where a node's first port row starts, below the node's top. */
export const PORTS_TOP = 2 * ROW

/** A waypoint's diameter. Its node's origin is its center: the position is where edges pass. */
export const WAYPOINT_SIZE = ROW

/** `value` on the nearest grid line. */
export function snap(value: number): number {
  return Math.round(value / SNAP) * SNAP
}

/** A node's top-left on the nearest grid point. */
export function snapPoint(point: Point): Point {
  return { x: snap(point.x), y: snap(point.y) }
}

/**
 * A waypoint's center (its node's position) with the node's top-left on the
 * nearest grid point, where a drag leaves it.
 */
export function snapWaypointCenter(center: Point): Point {
  const half = WAYPOINT_SIZE / 2
  return { x: snap(center.x - half) + half, y: snap(center.y - half) + half }
}

/**
 * How far to move a group of nodes that is to start at `to` instead of
 * `from`: whole grid steps, so nodes on the grid stay on it and keep their
 * places among themselves.
 */
export function snapOffset(from: Point, to: Point): Point {
  return { x: snap(to.x - from.x), y: snap(to.y - from.y) }
}
