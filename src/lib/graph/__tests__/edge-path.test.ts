import { describe, it, expect } from "vitest"
import {
  buildEdgePath,
  findInsertionIndex,
  samePoints,
  segmentCorners,
  waypointCenter,
  type Point,
} from "../edge-path"
import { WAYPOINT_SIZE } from "../grid"

/** Every run of the corners is horizontal, vertical or 45°. */
function octilinear(corners: Point[]): boolean {
  for (let i = 0; i < corners.length - 1; i++) {
    const dx = Math.abs(corners[i + 1].x - corners[i].x)
    const dy = Math.abs(corners[i + 1].y - corners[i].y)
    if (dx > 1e-9 && dy > 1e-9 && Math.abs(dx - dy) > 1e-9) return false
  }
  return true
}

describe("segmentCorners", () => {
  it("leaves and enters horizontally, taking the rise in one 45° run in the middle", () => {
    const c = segmentCorners({ x: 0, y: 0 }, { x: 300, y: 100 })
    expect(c).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 100 }, { x: 300, y: 100 }])
  })

  it("goes vertical between two 45° turns when the rise is larger than the run", () => {
    const c = segmentCorners({ x: 0, y: 0 }, { x: 100, y: 400 })
    expect(octilinear(c)).toBe(true)
    expect(c[1]).toEqual({ x: 16, y: 0 }) // the lead out of the output
    expect(c[c.length - 2]).toEqual({ x: 84, y: 400 }) // the lead into the input
    expect(c.some((p, i) => i > 0 && p.x === c[i - 1].x && p.y !== c[i - 1].y)).toBe(true) // a vertical run
  })

  it("loops around in a U when going back left", () => {
    const c = segmentCorners({ x: 300, y: 0 }, { x: 0, y: 10 })
    expect(octilinear(c)).toBe(true)
    expect(c[1].x).toBeGreaterThan(300) // out to the right first
    expect(c[c.length - 2].x).toBeLessThan(0) // in from the left
    expect(Math.max(...c.map(p => p.y))).toBe(50) // below the lower end
  })

  it("steps between ends closer than two leads, without leaving the box of the two ends", () => {
    for (const [x, y] of [[0, 60], [10, 0], [20, 5], [20, -80], [31, 30]]) {
      const c = segmentCorners({ x: 0, y: 0 }, { x, y })
      expect(octilinear(c)).toBe(true)
      for (const p of c) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(x)
        expect(p.y).toBeGreaterThanOrEqual(Math.min(0, y))
        expect(p.y).toBeLessThanOrEqual(Math.max(0, y))
      }
    }
    // The step is halfway between the ends
    expect(segmentCorners({ x: 0, y: 0 }, { x: 20, y: 60 })).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 60 }, { x: 10, y: 60 }, { x: 20, y: 60 },
    ])
  })

  it("stays octilinear for any ends", () => {
    for (const [x, y] of [[50, 3], [33, -200], [400, -399], [10, 10], [-5, 300], [600, 0]]) {
      expect(octilinear(segmentCorners({ x: 0, y: 0 }, { x, y }))).toBe(true)
    }
  })
})

describe("buildEdgePath", () => {
  it("starts at the source and ends at the target", () => {
    const path = buildEdgePath({ x: 0, y: 0 }, { x: 300, y: 100 }, [])
    expect(path).toMatch(/^M 0,0 /)
    expect(path).toMatch(/L 300,100$/)
  })

  it("rounds each corner", () => {
    const path = buildEdgePath({ x: 0, y: 0 }, { x: 300, y: 100 }, [])
    expect((path.match(/ Q /g) || []).length).toBe(2)
  })

  it("passes through each waypoint", () => {
    const path = buildEdgePath({ x: 0, y: 0 }, { x: 600, y: 0 }, [{ x: 300, y: 100 }])
    expect(path).toContain("300,100")
  })
})

describe("findInsertionIndex", () => {
  it("returns 0 for click near source-target midpoint (no waypoints)", () => {
    const idx = findInsertionIndex(
      50, 0,
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      [],
    )
    expect(idx).toBe(0)
  })

  it("returns correct index for click between waypoints", () => {
    const source: Point = { x: 0, y: 0 }
    const target: Point = { x: 300, y: 0 }
    const waypoints: Point[] = [{ x: 100, y: 0 }, { x: 200, y: 0 }]

    // Click near the midpoint of wp1→wp2 segment (150, 0)
    const idx = findInsertionIndex(150, 0, source, target, waypoints)
    expect(idx).toBe(1) // Insert between wp1 and wp2

    // Click near the midpoint of source→wp1 segment (50, 0)
    const idx2 = findInsertionIndex(50, 0, source, target, waypoints)
    expect(idx2).toBe(0) // Insert before wp1

    // Click near the midpoint of wp2→target segment (250, 0)
    const idx3 = findInsertionIndex(250, 0, source, target, waypoints)
    expect(idx3).toBe(2) // Insert after wp2
  })
})

describe("waypointCenter", () => {
  it("is the middle of the waypoint node, where its centered position is", () => {
    // origin [0.5, 0.5]: React Flow's positionAbsolute is the top-left, half a size before the position
    const position = { x: 100, y: 40 }
    const topLeft = { x: position.x - WAYPOINT_SIZE / 2, y: position.y - WAYPOINT_SIZE / 2 }
    expect(waypointCenter(topLeft)).toEqual(position)
  })
})

describe("samePoints", () => {
  it("compares coordinates, not arrays", () => {
    expect(samePoints([{ x: 1, y: 2 }], [{ x: 1, y: 2 }])).toBe(true)
    expect(samePoints([{ x: 1, y: 2 }], [{ x: 1, y: 3 }])).toBe(false)
    expect(samePoints([], [{ x: 1, y: 2 }])).toBe(false)
    expect(samePoints([], [])).toBe(true)
  })
})
