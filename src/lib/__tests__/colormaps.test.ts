import { describe, expect, it } from "vitest"

import {
  buildColormapLut,
  buildLut,
  COLORMAP_OPTIONS,
  colormapCssGradient,
  colormapPlotlyScale,
  colormapStops,
  DEFAULT_COLORMAP,
  isColormapName,
  PORTLAND_STOPS,
  resolveColormap,
} from "@/src/lib/colormaps"
import { buildPortlandLut } from "@/src/lib/heatmap-raster"

// Reference entries of matplotlib's 256-entry tables (index -> sRGB 0-255).
const REFERENCE: Record<string, Array<[number, [number, number, number]]>> = {
  viridis: [
    [0, [68, 1, 84]],
    [64, [59, 82, 139]],
    [128, [33, 145, 140]],
    [192, [94, 201, 98]],
    [255, [253, 231, 37]],
  ],
  magma: [
    [0, [0, 0, 4]],
    [128, [183, 55, 121]],
    [255, [252, 253, 191]],
  ],
  inferno: [
    [0, [0, 0, 4]],
    [192, [249, 142, 9]],
    [255, [252, 255, 164]],
  ],
  plasma: [
    [0, [13, 8, 135]],
    [128, [204, 71, 120]],
    [255, [240, 249, 33]],
  ],
  cividis: [
    [0, [0, 34, 78]],
    [128, [125, 124, 120]],
    [255, [254, 232, 56]],
  ],
}

function relLuminance([r, g, b]: number[]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

describe("colormap catalog", () => {
  it("defaults to viridis and resolves unknown values to it", () => {
    expect(DEFAULT_COLORMAP).toBe("viridis")
    expect(resolveColormap(undefined)).toBe("viridis")
    expect(resolveColormap("jet")).toBe("viridis")
    expect(resolveColormap("magma")).toBe("magma")
    expect(isColormapName("portland")).toBe(true)
    expect(isColormapName(42)).toBe(false)
  })

  it("has 33 stops spanning t = 0..1 for every sampled map", () => {
    for (const { value } of COLORMAP_OPTIONS) {
      const stops = colormapStops(value)
      expect(stops[0][0]).toBe(0)
      expect(stops[stops.length - 1][0]).toBe(1)
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0])
      }
      if (value !== "portland") expect(stops.length).toBe(33)
    }
    expect(colormapStops("portland")).toBe(PORTLAND_STOPS)
  })
})

describe("buildColormapLut", () => {
  it("matches matplotlib's tables within 5/255 per channel", () => {
    for (const [name, refs] of Object.entries(REFERENCE)) {
      const lut = buildColormapLut(name as never)
      for (const [i, [r, g, b]] of refs) {
        expect(Math.abs(lut[i * 4] - r)).toBeLessThanOrEqual(5)
        expect(Math.abs(lut[i * 4 + 1] - g)).toBeLessThanOrEqual(5)
        expect(Math.abs(lut[i * 4 + 2] - b)).toBeLessThanOrEqual(5)
        expect(lut[i * 4 + 3]).toBe(255)
      }
    }
  })

  it("is monotonically brighter for the perceptually uniform maps", () => {
    for (const name of ["viridis", "magma", "inferno", "plasma", "cividis"] as const) {
      const lut = buildColormapLut(name)
      let prev = -1
      for (let i = 0; i < 256; i += 8) {
        const y = relLuminance([lut[i * 4], lut[i * 4 + 1], lut[i * 4 + 2]])
        expect(y).toBeGreaterThan(prev)
        prev = y
      }
    }
  })

  it("keeps the legacy Portland LUT byte-identical", () => {
    expect(Array.from(buildColormapLut("portland"))).toEqual(
      Array.from(buildPortlandLut()),
    )
    expect(Array.from(buildLut(PORTLAND_STOPS))).toEqual(Array.from(buildPortlandLut()))
  })
})

describe("colormap exports for CSS / Plotly", () => {
  it("builds a bottom-to-top CSS gradient over all stops", () => {
    const g = colormapCssGradient("viridis")
    expect(g.startsWith("linear-gradient(to top, rgb(68,1,84) 0%")).toBe(true)
    expect(g.endsWith("rgb(253,231,37) 100%)")).toBe(true)
    expect(colormapCssGradient("magma", "to right").startsWith("linear-gradient(to right,")).toBe(true)
  })

  it("builds a Plotly colorscale from 0 to 1", () => {
    const scale = colormapPlotlyScale("viridis")
    expect(scale[0]).toEqual([0, "rgb(68,1,84)"])
    expect(scale[scale.length - 1]).toEqual([1, "rgb(253,231,37)"])
  })
})
