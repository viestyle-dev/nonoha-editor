import { describe, expect, it } from "vitest"
import { Hct, hexFromArgb } from "@material/material-color-utilities"
import { edgeColors, inputHandleColor } from "../port-colors"

const pallet = {
  dataTypes: {
    f32: Hct.from(216, 60, 60),
    f64: Hct.from(240, 60, 60),
    any: Hct.from(336, 60, 60),
  },
}
const hex = (name: keyof typeof pallet.dataTypes) => hexFromArgb(pallet.dataTypes[name].toInt())

describe("edgeColors", () => {
  it("shifts from the source type's color to the target's when the base types differ, any included", () => {
    expect(edgeColors("f32", "f64", pallet)).toEqual([hex("f32"), hex("f64")])
    expect(edgeColors("f32[6x8]", "any", pallet)).toEqual([hex("f32"), hex("any")])
  })

  it("keeps one color for one base type", () => {
    expect(edgeColors("f32[6x8]", "f32[?x?]", pallet)).toEqual([hex("f32"), hex("f32")])
  })

  it("takes the typed end's color for an end without a type, and none without any", () => {
    expect(edgeColors(undefined, "f64", pallet)).toEqual([hex("f64"), hex("f64")])
    expect(edgeColors("f32", undefined, pallet)).toEqual([hex("f32"), hex("f32")])
    expect(edgeColors(undefined, undefined, pallet)).toBeNull()
  })
})

describe("inputHandleColor", () => {
  it("is the type's color for one base type, else the neutral one", () => {
    expect(inputHandleColor(["f32[?]", "f32[?x?]"], pallet, "#808080")).toBe(hex("f32"))
    expect(inputHandleColor(["f32[?]", "f64[?]"], pallet, "#808080")).toBe("#808080")
    expect(inputHandleColor([], pallet, "#808080")).toBe("#808080")
    expect(inputHandleColor(undefined, pallet, "#808080")).toBe("#808080")
    expect(inputHandleColor(["thing"], pallet, "#808080")).toBe("#808080")
  })
})
