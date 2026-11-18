// Pure data core for the uPlot-based FastHeatmapGraphNode.
//
// Holds the z-matrix as a flat Float32Array ring buffer (column-major:
// values[col * yLength + row]) plus an ImageData-compatible RGBA pixel
// buffer (width = xLength, height = yLength). Columns advance like the
// existing heatmap/time-series ring buffers; painting is incremental
// (only the columns written by a batch are re-colored), and a full repaint
// only happens when the z range or the geometry changes.
//
// Kept free of DOM APIs (no ImageData construction here) so it is unit
// testable under vitest's node environment. The renderer wraps `pixels`
// into an ImageData and blits it onto the uPlot canvas.

import { buildLut, PORTLAND_STOPS } from "./colormaps"

// Plotly's built-in "Portland" colorscale stops (kept exported for existing
// callers; the colormap catalog lives in ./colormaps).
export { PORTLAND_STOPS }

// 256-entry RGBA lookup table for the legacy Portland look. Other colormaps:
// buildColormapLut() in ./colormaps.
export function buildPortlandLut(): Uint8ClampedArray {
  return buildLut(PORTLAND_STOPS)
}

export class HeatmapRaster {
  private _xLength = 0
  private _yLength = 0
  // Flat z values, column-major: values[col * yLength + row].
  // Row 0 corresponds to yLabels[0] (the lowest y value). NaN = empty cell.
  private _values = new Float32Array(0)
  // RGBA pixels, ImageData layout (row-major, y = 0 is the TOP row), so
  // data row r is painted into pixel row (yLength - 1 - r) to put low y
  // values at the bottom of the image.
  private _pixels = new Uint8ClampedArray(0)
  // 32-bit view of _pixels for one-store-per-cell painting.
  private _pixels32 = new Uint32Array(0)
  // Per-column extrema of the stored values (NaN = column empty).
  private _colMin = new Float32Array(0)
  private _colMax = new Float32Array(0)
  // Reused return value of writeColumns().
  private _dirty: number[] = []
  private _cursor = 0

  get xLength(): number {
    return this._xLength
  }

  get yLength(): number {
    return this._yLength
  }

  // Write head position (index of the next column to be written).
  get cursor(): number {
    return this._cursor
  }

  get pixels(): Uint8ClampedArray {
    return this._pixels
  }

  // Reallocates the buffers when the geometry changes; always clears.
  configure(xLength: number, yLength: number): void {
    if (xLength <= 0 || yLength <= 0) {
      throw new Error(`Invalid raster size: ${xLength} x ${yLength}`)
    }
    if (this._xLength !== xLength || this._yLength !== yLength) {
      this._xLength = xLength
      this._yLength = yLength
      this._values = new Float32Array(xLength * yLength)
      this._pixels = new Uint8ClampedArray(xLength * yLength * 4)
      this._pixels32 = new Uint32Array(this._pixels.buffer)
      this._colMin = new Float32Array(xLength)
      this._colMax = new Float32Array(xLength)
    }
    this.clear()
  }

  clear(): void {
    this._values.fill(NaN)
    this._pixels.fill(0)
    this._colMin.fill(NaN)
    this._colMax.fill(NaN)
    this._cursor = 0
  }

  // Reads a flat 2-D batch (row-major: batch[b * yLength + row]) and writes
  // each batch row as one column at the ring write head. Returns the list of
  // columns written (in write order) so painting can stay incremental.
  // When batchSize exceeds xLength, only the trailing xLength rows survive.
  //
  // The returned array is reused by the next call (no per-batch allocation):
  // consume it before writing again. Each written column's min/max is
  // recorded so computeMinMax() costs O(xLength), not O(xLength * yLength).
  writeColumns(batch: ArrayLike<number>, batchSize: number): number[] {
    const dirty = this._dirty
    dirty.length = 0
    const xLength = this._xLength
    const yLength = this._yLength
    if (xLength === 0 || yLength === 0 || batchSize <= 0) {
      return dirty
    }

    const values = this._values
    const start = Math.max(0, batchSize - xLength)
    for (let b = start; b < batchSize; b++) {
      const col = (this._cursor + (b - start)) % xLength
      const src = b * yLength
      const dst = col * yLength
      let lo = Infinity
      let hi = -Infinity
      for (let r = 0; r < yLength; r++) {
        // Track the stored (float32-rounded) value; NaN fails both compares.
        const v = Math.fround(batch[src + r] as number)
        values[dst + r] = v
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      const empty = lo > hi // all NaN
      this._colMin[col] = empty ? NaN : lo
      this._colMax[col] = empty ? NaN : hi
      dirty.push(col)
    }
    this._cursor = (this._cursor + (batchSize - start)) % xLength
    return dirty
  }

  // Colors the given columns into the pixel buffer using the LUT.
  // Values are normalized to [zMin, zMax] and clamped; NaN cells become
  // fully transparent so the chart background shows through.
  paintColumns(
    cols: readonly number[],
    zMin: number,
    zMax: number,
    lut: Uint8ClampedArray
  ): void {
    const words = lutWords(lut)
    for (let i = 0; i < cols.length; i++) {
      this._paintColumn(cols[i], zMin, zMax, lut, words)
    }
  }

  paintAll(zMin: number, zMax: number, lut: Uint8ClampedArray): void {
    const words = lutWords(lut)
    for (let c = 0; c < this._xLength; c++) {
      this._paintColumn(c, zMin, zMax, lut, words)
    }
  }

  private _paintColumn(
    col: number,
    zMin: number,
    zMax: number,
    lut: Uint8ClampedArray,
    words: Uint32Array | null
  ): void {
    const xLength = this._xLength
    const yLength = this._yLength
    const values = this._values
    const span = zMax - zMin
    const scale = span > 0 ? 255 / span : 0
    const src = col * yLength
    // Pixel of data row r: ((yLength - 1 - r) * xLength + col).
    let p = (yLength - 1) * xLength + col
    if (words) {
      // One 32-bit store per cell (little-endian RGBA words).
      const pixels32 = this._pixels32
      for (let r = 0; r < yLength; r++, p -= xLength) {
        const v = values[src + r]
        if (v !== v) {
          pixels32[p] = 0 // NaN -> transparent
          continue
        }
        let t = Math.round((v - zMin) * scale)
        if (t < 0) t = 0
        else if (t > 255) t = 255
        pixels32[p] = words[t]
      }
      return
    }
    const pixels = this._pixels
    for (let r = 0; r < yLength; r++, p -= xLength) {
      const v = values[src + r]
      const px = p * 4
      if (v !== v) {
        pixels[px + 3] = 0
        continue
      }
      let t = Math.round((v - zMin) * scale)
      if (t < 0) t = 0
      else if (t > 255) t = 255
      const l = t * 4
      pixels[px + 0] = lut[l + 0]
      pixels[px + 1] = lut[l + 1]
      pixels[px + 2] = lut[l + 2]
      pixels[px + 3] = 255
    }
  }

  // Returns the stored z value at (col, row); NaN for empty or out-of-range
  // cells. Used by the hover tooltip.
  valueAt(col: number, row: number): number {
    if (col < 0 || col >= this._xLength || row < 0 || row >= this._yLength) {
      return NaN
    }
    return this._values[col * this._yLength + row]
  }

  // Min/max over the valid (non-NaN) cells, for the automatic z range.
  // O(xLength): folds the per-column extrema kept by writeColumns().
  computeMinMax(): { min: number; max: number } | undefined {
    let min = Infinity
    let max = -Infinity
    const colMin = this._colMin
    const colMax = this._colMax
    for (let c = 0; c < this._xLength; c++) {
      // Empty columns hold NaN, which fails both compares.
      const lo = colMin[c]
      const hi = colMax[c]
      if (lo < min) min = lo
      if (hi > max) max = hi
    }
    if (min > max) {
      return undefined
    }
    return { min, max }
  }
}

const IS_LITTLE_ENDIAN =
  new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04

// LUT as 256 packed RGBA words (little-endian hosts), cached per LUT. LUTs
// are treated as immutable once painted with.
const LUT_WORDS = new WeakMap<Uint8ClampedArray, Uint32Array>()

function lutWords(lut: Uint8ClampedArray): Uint32Array | null {
  if (!IS_LITTLE_ENDIAN || lut.length < 256 * 4 || lut.byteOffset % 4 !== 0) {
    return null
  }
  let words = LUT_WORDS.get(lut)
  if (!words) {
    // Copy (not a view) so the words stay opaque regardless of LUT alpha.
    words = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      words[i] =
        ((255 << 24) | (lut[i * 4 + 2] << 16) | (lut[i * 4 + 1] << 8) | lut[i * 4]) >>> 0
    }
    LUT_WORDS.set(lut, words)
  }
  return words
}
