import { describe, expect, it } from "vitest"
import { PortDataType } from "nonoha-client-js"
import { alternativeKinds, interpretValue } from "../interpret"

describe("interpretValue", () => {
  it("draws a stream of items (an audio block) as a series, one item as before", () => {
    expect(interpretValue(PortDataType.Float32, [512])).toBe("series") // mono block
    expect(interpretValue(PortDataType.Float32, [512, 2])).toBe("series") // stereo block
    expect(interpretValue(PortDataType.Float32, [1])).toBe("scalar")
    expect(interpretValue(PortDataType.Float32, [1, 2])).toBe("vector")
    expect(interpretValue(PortDataType.Float32, [4, 513])).toBe("vector") // spectra: the last one
    expect(interpretValue(PortDataType.Uint8, [1, 480, 640, 3])).toBe("image")
    expect(alternativeKinds("series")).toEqual(["series", "scalar"])
  })
})
