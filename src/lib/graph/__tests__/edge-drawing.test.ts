import { describe, expect, it } from "vitest"
import { edgeDrawings, outputKey, type DrawnEdge } from "../edge-drawing"

let n = 0
const e = (source: string, sourceHandle: string | null, target: string, targetHandle: string | null): DrawnEdge => ({
  id: `e${n++}`,
  source,
  sourceHandle,
  target,
  targetHandle,
})
const none = () => undefined

// A chain A -> B -> C -> D -> E (layers 0..4), as the flow other edges join
const chain = [e("A", "out", "B", "in"), e("B", "out", "C", "in"), e("C", "out", "D", "in"), e("D", "out", "E", "in")]

describe("edgeDrawings", () => {
  it("draws the flow as lines", () => {
    const { of } = edgeDrawings(chain, none)
    expect(chain.map(x => of.get(x.id))).toEqual(["line", "line", "line", "line"])
  })

  it("draws an output whose consumers are all settings as references", () => {
    const preset = [e("P", "scale", "C", "@scale"), e("P", "scale", "E", "@scale")]
    const { of, outputs } = edgeDrawings([...chain, ...preset], none)
    expect(preset.map(x => of.get(x.id))).toEqual(["reference", "reference"])
    expect(outputs.get(outputKey("P", "scale"))).toMatchObject({ references: 2, displays: 0 })
  })

  it("draws an edge the engine refused as a line among references, and does not count it", () => {
    const preset = [e("P", "scale", "C", "@scale"), { ...e("P", "scale", "E", "@scale"), data: { valid: false } }]
    const { of, outputs } = edgeDrawings([...chain, ...preset], none)
    expect(preset.map(x => of.get(x.id))).toEqual(["reference", "line"])
    expect(outputs.get(outputKey("P", "scale"))).toMatchObject({ references: 1, displays: 0 })
  })

  it("draws an output used at three or more layers as references, all of its edges", () => {
    const clock = [e("K", "time", "B", "time"), e("K", "time", "D", "time"), e("K", "time", "E", "time")]
    const split = [e("A", "out", "C", "x")] // a second consumer two layers on: still a line
    const { of } = edgeDrawings([...chain, ...clock, ...split], none)
    expect(clock.map(x => of.get(x.id))).toEqual(["reference", "reference", "reference"])
    expect(of.get(split[0].id)).toBe("line")
    expect(of.get(chain[0].id)).toBe("line") // A.out goes to B and C: two layers
  })

  it("never mixes lines and references on one output", () => {
    const mixed = [e("P", "gain", "C", "@gain"), e("P", "gain", "D", "mix")]
    const { of } = edgeDrawings([...chain, ...mixed], none)
    expect(mixed.map(x => of.get(x.id))).toEqual(["line", "line"])
  })

  it("marks displays apart from the data edges of the same output", () => {
    const watch = e("B", "out", "$editor:Chart_1", "series")
    const { of, outputs } = edgeDrawings([...chain, watch], none)
    expect(of.get(watch.id)).toBe("display")
    expect(of.get(chain[1].id)).toBe("line")
    expect(outputs.get(outputKey("B", "out"))).toMatchObject({ references: 0, displays: 1, markEdge: watch.id })
  })

  it("keeps edges between editor nodes as data (a camera into an image display)", () => {
    const local = e("$editor:Camera_1", "image", "$editor:Image_1", "image")
    expect(edgeDrawings([local], none).of.get(local.id)).toBe("line")
  })

  it("follows the source's drawAs over the rule", () => {
    const clock = [e("K", "time", "B", "time"), e("K", "time", "D", "time"), e("K", "time", "E", "time")]
    const drawAs = (source: string, handle: string | null | undefined) =>
      source === "K" && handle === "time" ? ("line" as const) : source === "A" ? ("reference" as const) : undefined
    const { of } = edgeDrawings([...chain, ...clock], drawAs)
    expect(clock.map(x => of.get(x.id))).toEqual(["line", "line", "line"])
    expect(of.get(chain[0].id)).toBe("reference")
  })

  it("survives a cycle", () => {
    const loop = [e("A", "out", "B", "in"), e("B", "out", "A", "fb")]
    const { of } = edgeDrawings(loop, none)
    expect(loop.map(x => of.get(x.id))).toEqual(["line", "line"])
  })
})
