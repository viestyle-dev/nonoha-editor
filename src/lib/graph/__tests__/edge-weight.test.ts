import { describe, expect, it } from "vitest"
import { edgeWeight } from "../edge-weight"

describe("edgeWeight", () => {
  it("draws scalars thin, small arrays medium, large or open shapes thick", () => {
    expect(edgeWeight("f32")).toBe(2)
    expect(edgeWeight("bool")).toBe(2)
    expect(edgeWeight("f32[1]")).toBe(2)
    expect(edgeWeight("f32[7]")).toBe(2.5)
    expect(edgeWeight("f32[6x8]")).toBe(2.5)
    expect(edgeWeight("f32[8x8]")).toBe(2.5)
    expect(edgeWeight("f32[65]")).toBe(4)
    expect(edgeWeight("u8[180x320]")).toBe(4)
    expect(edgeWeight("f32[?x?x2]")).toBe(4)
    expect(edgeWeight("f32[?]")).toBe(4)
  })

  it("draws what does not say its size medium", () => {
    expect(edgeWeight(undefined)).toBe(2.5)
    expect(edgeWeight("any")).toBe(2.5)
  })
})
