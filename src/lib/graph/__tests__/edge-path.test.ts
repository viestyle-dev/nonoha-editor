import { describe, it, expect } from "vitest"
import {
  bezierSegment,
  buildEdgePath,
  findInsertionIndex,
  type Point,
} from "../edge-path"

describe("bezierSegment", () => {
  it("returns a cubic bezier C command", () => {
    const result = bezierSegment({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(result).toMatch(/^C /)
    expect(result).toContain("100,0")
  })

  it("ends at the target point", () => {
    const result = bezierSegment({ x: 10, y: 20 }, { x: 200, y: 50 })
    expect(result).toMatch(/200,50$/)
  })

  it("uses horizontal control points", () => {
    const result = bezierSegment({ x: 0, y: 100 }, { x: 200, y: 100 })
    // Control points should have same Y as their respective endpoints
    // Format: C cx1,cy1 cx2,cy2 x,y
    const match = result.match(/^C ([\d.]+),([\d.]+) ([\d.]+),([\d.]+)/)
    expect(match).not.toBeNull()
    expect(Number(match![2])).toBe(100) // cy1 = sourceY
    expect(Number(match![4])).toBe(100) // cy2 = targetY
  })
})

describe("buildEdgePath", () => {
  it("returns M...C path for direct connection (no waypoints)", () => {
    const path = buildEdgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, [])
    expect(path).toMatch(/^M 0,0 C/)
    expect(path).toMatch(/100,0$/)
  })

  it("includes waypoint in path", () => {
    const path = buildEdgePath(
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      [{ x: 100, y: 50 }],
    )
    // Should have 2 bezier segments: source→wp and wp→target
    const cCount = (path.match(/C /g) || []).length
    expect(cCount).toBe(2)
    expect(path).toContain("100,50")
  })

  it("handles multiple waypoints", () => {
    const path = buildEdgePath(
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      [
        { x: 100, y: 50 },
        { x: 200, y: -50 },
      ],
    )
    const cCount = (path.match(/C /g) || []).length
    expect(cCount).toBe(3) // 3 segments for 2 waypoints
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
