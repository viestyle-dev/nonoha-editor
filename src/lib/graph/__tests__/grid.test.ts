import { describe, expect, it } from "vitest"

import { PORTS_TOP, ROW, SNAP, snap, snapOffset, snapPoint, snapWaypointCenter, WAYPOINT_SIZE } from "../grid"

describe("grid", () => {
  it("keeps the rows of every node on the same lines", () => {
    // A node sits on a multiple of SNAP: its rows are on the row lines only when SNAP divides ROW
    expect(ROW % SNAP).toBe(0)
    // The first row starts a whole number of rows below the top
    expect(PORTS_TOP % ROW).toBe(0)
    // A waypoint's center is where a port's is: half a row below a grid line
    expect(WAYPOINT_SIZE / 2).toBe(ROW / 2)
    expect((ROW / 2) % 1).toBe(0)
  })

  it("puts a value on the nearest grid line", () => {
    expect(snap(0)).toBe(0)
    expect(snap(SNAP / 2 - 1)).toBe(0)
    expect(snap(SNAP / 2 + 1)).toBe(SNAP)
    expect(snap(-(SNAP / 2 + 1))).toBe(-SNAP)
  })

  it("puts a node's top-left on the nearest grid point", () => {
    expect(snapPoint({ x: 233, y: 148 })).toEqual({ x: 240, y: 140 })
  })

  it("puts a waypoint's top-left on the grid, as a drag does", () => {
    const center = snapWaypointCenter({ x: 233, y: 148 })
    expect((center.x - WAYPOINT_SIZE / 2) % SNAP).toBe(0)
    expect((center.y - WAYPOINT_SIZE / 2) % SNAP).toBe(0)
    expect(Math.abs(center.x - 233)).toBeLessThanOrEqual(SNAP / 2)
    expect(Math.abs(center.y - 148)).toBeLessThanOrEqual(SNAP / 2)
  })

  it("moves a group by whole grid steps", () => {
    const offset = snapOffset({ x: 40, y: 60 }, { x: 1013, y: 507 })
    expect(offset).toEqual({ x: 980, y: 440 })
    // A node on the grid stays on it; two nodes keep their places among themselves
    expect((40 + offset.x) % SNAP).toBe(0)
    expect((60 + offset.y) % SNAP).toBe(0)
  })
})
