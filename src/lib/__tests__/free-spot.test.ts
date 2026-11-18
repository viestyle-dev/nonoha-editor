import { describe, expect, it } from "vitest"
import { findFreeSpot } from "@/src/lib/graph/free-spot"

describe("findFreeSpot", () => {
  const size = { width: 100, height: 80 }

  it("keeps the preferred spot when it is free", () => {
    expect(findFreeSpot({ x: 0, y: 0 }, size, [{ x: 300, y: 0, width: 50, height: 50 }])).toEqual({ x: 0, y: 0 })
  })

  it("moves down past an occupied area", () => {
    const spot = findFreeSpot({ x: 0, y: 0 }, size, [{ x: 0, y: 0, width: 120, height: 200 }], { margin: 20 })
    expect(spot.x).toBe(0)
    expect(spot.y).toBeGreaterThanOrEqual(220)
  })

  it("moves to the next column when the column is full", () => {
    const tall = [{ x: 0, y: 0, width: 120, height: 5000 }]
    const spot = findFreeSpot({ x: 0, y: 0 }, size, tall, { rows: 10 })
    expect(spot.x).toBeGreaterThan(0)
  })
})
