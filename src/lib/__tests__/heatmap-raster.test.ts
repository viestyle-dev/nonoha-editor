import { describe, expect, it } from "vitest"

import {
  buildPortlandLut,
  HeatmapRaster,
  PORTLAND_STOPS,
} from "@/src/lib/heatmap-raster"

// Pixel index helper mirroring the raster's vertical flip:
// data row r of column c lives at pixel row (yLength - 1 - r).
function pxIndex(raster: HeatmapRaster, col: number, row: number): number {
  return ((raster.yLength - 1 - row) * raster.xLength + col) * 4
}

describe("buildPortlandLut", () => {
  it("matches the Portland stops at their exact positions", () => {
    const lut = buildPortlandLut()
    for (const [t, [r, g, b]] of PORTLAND_STOPS) {
      const i = Math.round(t * 255)
      expect(Math.abs(lut[i * 4 + 0] - r)).toBeLessThanOrEqual(2)
      expect(Math.abs(lut[i * 4 + 1] - g)).toBeLessThanOrEqual(2)
      expect(Math.abs(lut[i * 4 + 2] - b)).toBeLessThanOrEqual(2)
      expect(lut[i * 4 + 3]).toBe(255)
    }
  })

  it("interpolates between stops", () => {
    const lut = buildPortlandLut()
    // Midpoint between stop 0 (t=0) and stop 1 (t=0.25) is t=0.125 -> i=32.
    const i = 32
    expect(lut[i * 4]).toBeGreaterThan(Math.min(12, 10) - 1)
    expect(lut[i * 4 + 1]).toBeGreaterThan(51)
    expect(lut[i * 4 + 1]).toBeLessThan(136)
  })
})

describe("HeatmapRaster.writeColumns", () => {
  it("writes batch rows as consecutive columns and advances the cursor", () => {
    const raster = new HeatmapRaster()
    raster.configure(4, 2)
    const dirty = raster.writeColumns([1, 2, 3, 4], 2) // two columns [1,2], [3,4]
    expect(dirty).toEqual([0, 1])
    expect(raster.cursor).toBe(2)
  })

  it("wraps around the ring boundary", () => {
    const raster = new HeatmapRaster()
    raster.configure(3, 1)
    raster.writeColumns([10, 20], 2) // cols 0,1
    const dirty = raster.writeColumns([30, 40], 2) // cols 2,0 (wrap)
    expect(dirty).toEqual([2, 0])
    expect(raster.cursor).toBe(1)
  })

  it("keeps only the trailing xLength columns of an oversized batch", () => {
    const raster = new HeatmapRaster()
    raster.configure(2, 1)
    const dirty = raster.writeColumns([1, 2, 3, 4, 5], 5)
    expect(dirty).toEqual([0, 1])
    // Last two batch rows (4, 5) must survive.
    const lut = buildPortlandLut()
    raster.paintColumns(dirty, 4, 5, lut)
    expect(raster.pixels[pxIndex(raster, 0, 0) + 3]).toBe(255)
  })

  it("returns empty for an unconfigured raster or empty batch", () => {
    const raster = new HeatmapRaster()
    expect(raster.writeColumns([1], 1)).toEqual([])
    raster.configure(2, 1)
    expect(raster.writeColumns([], 0)).toEqual([])
  })
})

describe("HeatmapRaster.paintColumns", () => {
  it("maps values through the LUT with clamping at zMin/zMax", () => {
    const raster = new HeatmapRaster()
    raster.configure(3, 1)
    raster.writeColumns([-10, 0.5, 10], 3) // below range / middle / above range
    const lut = buildPortlandLut()
    raster.paintColumns([0, 1, 2], 0, 1, lut)

    // Clamped low -> first LUT entry.
    expect(raster.pixels[pxIndex(raster, 0, 0)]).toBe(lut[0])
    // Clamped high -> last LUT entry.
    expect(raster.pixels[pxIndex(raster, 2, 0)]).toBe(lut[255 * 4])
    // Middle -> LUT midpoint.
    expect(raster.pixels[pxIndex(raster, 1, 0)]).toBe(lut[128 * 4])
    // All painted cells opaque.
    expect(raster.pixels[pxIndex(raster, 0, 0) + 3]).toBe(255)
  })

  it("paints NaN cells as transparent", () => {
    const raster = new HeatmapRaster()
    raster.configure(2, 2)
    raster.writeColumns([NaN, 1], 1) // column 0: row0 = NaN, row1 = 1
    const lut = buildPortlandLut()
    raster.paintColumns([0], 0, 1, lut)
    expect(raster.pixels[pxIndex(raster, 0, 0) + 3]).toBe(0) // NaN row
    expect(raster.pixels[pxIndex(raster, 0, 1) + 3]).toBe(255)
    // Never-written column stays transparent.
    expect(raster.pixels[pxIndex(raster, 1, 0) + 3]).toBe(0)
  })

  it("flips rows vertically (data row 0 at the bottom of the image)", () => {
    const raster = new HeatmapRaster()
    raster.configure(1, 3)
    raster.writeColumns([0, 0.5, 1], 1) // rows bottom -> top: 0, 0.5, 1
    const lut = buildPortlandLut()
    raster.paintColumns([0], 0, 1, lut)
    // Pixel row 0 (top of image) must hold data row 2 (value 1 -> LUT max).
    const topPx = (0 * raster.xLength + 0) * 4
    expect(raster.pixels[topPx]).toBe(lut[255 * 4])
    // Pixel row 2 (bottom) must hold data row 0 (value 0 -> LUT min).
    const bottomPx = (2 * raster.xLength + 0) * 4
    expect(raster.pixels[bottomPx]).toBe(lut[0])
  })

  it("paints a constant field with the low end of the LUT when the span is zero", () => {
    const raster = new HeatmapRaster()
    raster.configure(1, 1)
    raster.writeColumns([5], 1)
    const lut = buildPortlandLut()
    raster.paintColumns([0], 5, 5, lut)
    expect(raster.pixels[3]).toBe(255) // opaque, no NaN poisoning
  })
})

describe("HeatmapRaster.valueAt", () => {
  it("returns the stored value at (col, row)", () => {
    const raster = new HeatmapRaster()
    raster.configure(3, 2)
    raster.writeColumns([1, 2, 3, 4], 2) // col 0: rows [1,2], col 1: rows [3,4]
    expect(raster.valueAt(0, 0)).toBe(1)
    expect(raster.valueAt(0, 1)).toBe(2)
    expect(raster.valueAt(1, 0)).toBe(3)
    expect(raster.valueAt(1, 1)).toBe(4)
  })

  it("returns NaN for never-written cells", () => {
    const raster = new HeatmapRaster()
    raster.configure(2, 2)
    raster.writeColumns([1, 2], 1) // only column 0 written
    expect(raster.valueAt(1, 0)).toBeNaN()
  })

  it("returns NaN out of range and on an unconfigured raster", () => {
    const raster = new HeatmapRaster()
    expect(raster.valueAt(0, 0)).toBeNaN()
    raster.configure(2, 2)
    expect(raster.valueAt(-1, 0)).toBeNaN()
    expect(raster.valueAt(0, -1)).toBeNaN()
    expect(raster.valueAt(2, 0)).toBeNaN()
    expect(raster.valueAt(0, 2)).toBeNaN()
  })
})

describe("HeatmapRaster.computeMinMax / clear / configure", () => {
  it("computes min/max over valid cells only", () => {
    const raster = new HeatmapRaster()
    raster.configure(3, 1)
    raster.writeColumns([2, -1], 2) // third column stays NaN
    expect(raster.computeMinMax()).toEqual({ min: -1, max: 2 })
  })

  it("returns undefined when nothing has been written", () => {
    const raster = new HeatmapRaster()
    raster.configure(2, 2)
    expect(raster.computeMinMax()).toBeUndefined()
  })

  it("clear resets values, pixels, and cursor", () => {
    const raster = new HeatmapRaster()
    raster.configure(2, 1)
    raster.writeColumns([1, 2], 2)
    raster.paintColumns([0, 1], 0, 2, buildPortlandLut())
    raster.clear()
    expect(raster.cursor).toBe(0)
    expect(raster.computeMinMax()).toBeUndefined()
    expect(raster.pixels.every(v => v === 0)).toBe(true)
  })

  it("configure reallocates on size change and always clears", () => {
    const raster = new HeatmapRaster()
    raster.configure(2, 1)
    raster.writeColumns([1, 2], 2)
    raster.configure(3, 2)
    expect(raster.xLength).toBe(3)
    expect(raster.yLength).toBe(2)
    expect(raster.cursor).toBe(0)
    expect(raster.pixels.length).toBe(3 * 2 * 4)
    expect(raster.computeMinMax()).toBeUndefined()
  })
})
