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

// Plotly's built-in "Portland" colorscale stops, transcribed so the new
// renderer matches the look of the existing Plotly heatmap node.
export const PORTLAND_STOPS: ReadonlyArray<
  readonly [number, readonly [number, number, number]]
> = [
  [0.0, [12, 51, 131]],
  [0.25, [10, 136, 186]],
  [0.5, [242, 211, 56]],
  [0.75, [242, 143, 56]],
  [1.0, [217, 30, 30]],
]

// 256-entry RGBA lookup table built by linear interpolation between stops.
export function buildPortlandLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    // Find the surrounding stops.
    let hi = 1
    while (hi < PORTLAND_STOPS.length - 1 && PORTLAND_STOPS[hi][0] < t) {
      hi++
    }
    const [t0, c0] = PORTLAND_STOPS[hi - 1]
    const [t1, c1] = PORTLAND_STOPS[hi]
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
    lut[i * 4 + 0] = c0[0] + (c1[0] - c0[0]) * f
    lut[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * f
    lut[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * f
    lut[i * 4 + 3] = 255
  }
  return lut
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
    }
    this.clear()
  }

  clear(): void {
    this._values.fill(NaN)
    this._pixels.fill(0)
    this._cursor = 0
  }

  // Reads a flat 2-D batch (row-major: batch[b * yLength + row]) and writes
  // each batch row as one column at the ring write head. Returns the list of
  // columns written (in write order) so painting can stay incremental.
  // When batchSize exceeds xLength, only the trailing xLength rows survive.
  writeColumns(batch: ArrayLike<number>, batchSize: number): number[] {
    const xLength = this._xLength
    const yLength = this._yLength
    if (xLength === 0 || yLength === 0 || batchSize <= 0) {
      return []
    }

    const start = Math.max(0, batchSize - xLength)
    const dirty: number[] = []
    for (let b = start; b < batchSize; b++) {
      const col = (this._cursor + (b - start)) % xLength
      const src = b * yLength
      const dst = col * yLength
      for (let r = 0; r < yLength; r++) {
        this._values[dst + r] = batch[src + r] as number
      }
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
    const xLength = this._xLength
    const yLength = this._yLength
    const span = zMax - zMin
    const scale = span > 0 ? 255 / span : 0
    for (const col of cols) {
      const src = col * yLength
      for (let r = 0; r < yLength; r++) {
        const v = this._values[src + r]
        const px = ((yLength - 1 - r) * xLength + col) * 4
        if (Number.isNaN(v)) {
          this._pixels[px + 3] = 0
          continue
        }
        let t = Math.round((v - zMin) * scale)
        if (t < 0) t = 0
        else if (t > 255) t = 255
        const l = t * 4
        this._pixels[px + 0] = lut[l + 0]
        this._pixels[px + 1] = lut[l + 1]
        this._pixels[px + 2] = lut[l + 2]
        this._pixels[px + 3] = 255
      }
    }
  }

  paintAll(zMin: number, zMax: number, lut: Uint8ClampedArray): void {
    const cols: number[] = []
    for (let c = 0; c < this._xLength; c++) {
      cols.push(c)
    }
    this.paintColumns(cols, zMin, zMax, lut)
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
  computeMinMax(): { min: number; max: number } | undefined {
    let min = Infinity
    let max = -Infinity
    const values = this._values
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      if (Number.isNaN(v)) {
        continue
      }
      if (v < min) min = v
      if (v > max) max = v
    }
    if (min > max) {
      return undefined
    }
    return { min, max }
  }
}
