/**
 * Canvas renderers for inspected values (peek popover, in-node previews).
 *
 * Plain functions over typed arrays: no React, no per-frame allocation
 * beyond what the canvas API needs. Callers keep a RendererState per
 * canvas and call these at most once per animation frame.
 */

import type { ChartTheme } from "@/src/lib/chart-theme"

type NumericArray = ArrayLike<number> | ArrayLike<bigint>

export interface RendererState {
  /** Grid: offscreen raster (one pixel per cell), reused while the size holds. */
  raster: HTMLCanvasElement | null
  rasterImage: ImageData | null
  /** Scalar: ring buffer of recent values. */
  history: Float64Array
  historyPos: number
  historyCount: number
}

export function createRendererState(historyLength = 120): RendererState {
  return {
    raster: null,
    rasterImage: null,
    history: new Float64Array(historyLength),
    historyPos: 0,
    historyCount: 0,
  }
}

function valueAt(array: NumericArray, i: number): number {
  return Number(array[i])
}

/** Min and max of array[offset, offset + length), ignoring NaN. */
export function finiteRange(array: NumericArray, offset: number, length: number): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (let i = offset, end = offset + length; i < end; ++i) {
    const v = valueAt(array, i)
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo === Infinity) return [0, 1]
  if (lo === hi) return [lo - 0.5, hi + 0.5]
  return [lo, hi]
}

/** Size the canvas backing store to its CSS box times the device pixel ratio. */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const ratio = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const w = Math.max(1, Math.round(width * ratio))
  const h = Math.max(1, Math.round(height * ratio))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  return { ctx, width, height }
}

const PAD = 6

function drawFrame(ctx: CanvasRenderingContext2D, width: number, height: number, theme: ChartTheme) {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = theme.plotBackground
  ctx.fillRect(0, 0, width, height)
}

function drawRangeLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lo: number,
  hi: number,
  theme: ChartTheme,
) {
  ctx.fillStyle = theme.axis
  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.fillText(formatNumber(hi), PAD, PAD)
  ctx.textBaseline = "bottom"
  ctx.fillText(formatNumber(lo), PAD, height - PAD)
}

/** Line plot of one row: array[offset, offset + length). */
export function drawVector(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  array: NumericArray,
  offset: number,
  length: number,
  theme: ChartTheme,
) {
  drawFrame(ctx, width, height, theme)
  if (length === 0) return
  const [lo, hi] = finiteRange(array, offset, length)
  const plotH = height - 2 * PAD
  const scaleY = plotH / (hi - lo)
  const stepX = length > 1 ? (width - 2 * PAD) / (length - 1) : 0

  if (lo < 0 && hi > 0) {
    const zeroY = PAD + (hi - 0) * scaleY
    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, zeroY)
    ctx.lineTo(width - PAD, zeroY)
    ctx.stroke()
  }

  ctx.strokeStyle = theme.series[0]
  ctx.lineWidth = 1.5
  ctx.lineJoin = "round"
  ctx.beginPath()
  // At most ~2 points per pixel: longer rows are drawn as min/max columns.
  const columns = Math.max(1, Math.floor(width - 2 * PAD))
  if (length <= columns * 2) {
    for (let i = 0; i < length; ++i) {
      const x = PAD + i * stepX
      const y = PAD + (hi - valueAt(array, offset + i)) * scaleY
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  } else {
    const per = length / columns
    for (let c = 0; c < columns; ++c) {
      const start = offset + Math.floor(c * per)
      const end = offset + Math.floor((c + 1) * per)
      let cmin = Infinity
      let cmax = -Infinity
      for (let i = start; i < end; ++i) {
        const v = valueAt(array, i)
        if (v < cmin) cmin = v
        if (v > cmax) cmax = v
      }
      const x = PAD + c
      ctx.moveTo(x, PAD + (hi - cmax) * scaleY)
      ctx.lineTo(x, PAD + (hi - cmin) * scaleY)
    }
  }
  ctx.stroke()
  drawRangeLabels(ctx, width, height, lo, hi, theme)
}

/** Heatmap of one rows x cols grid at array[offset...], colored by `lut` (256 RGBA entries). */
export function drawGrid(
  state: RendererState,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  array: NumericArray,
  offset: number,
  rows: number,
  cols: number,
  lut: Uint8ClampedArray,
  theme: ChartTheme,
) {
  drawFrame(ctx, width, height, theme)
  if (rows === 0 || cols === 0) return
  let raster = state.raster
  if (!raster) raster = state.raster = document.createElement("canvas")
  if (raster.width !== cols || raster.height !== rows || !state.rasterImage) {
    raster.width = cols
    raster.height = rows
    state.rasterImage = new ImageData(cols, rows)
  }
  const image = state.rasterImage
  const data = image.data
  const [lo, hi] = finiteRange(array, offset, rows * cols)
  const scale = 255 / (hi - lo)
  for (let i = 0, n = rows * cols; i < n; ++i) {
    const v = valueAt(array, offset + i)
    const index = v === v ? Math.max(0, Math.min(255, ((v - lo) * scale) | 0)) : 0
    const src = index * 4
    const dst = i * 4
    data[dst] = lut[src]
    data[dst + 1] = lut[src + 1]
    data[dst + 2] = lut[src + 2]
    data[dst + 3] = 255
  }
  raster.getContext("2d")!.putImageData(image, 0, 0)

  // Keep cells square-ish: fit the grid into the box.
  const cell = Math.min(width / cols, height / rows)
  const w = cell * cols
  const h = cell * rows
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(raster, (width - w) / 2, (height - h) / 2, w, h)
  drawRangeLabels(ctx, width, height, lo, hi, theme)
}

/** Push a scalar into the history ring. */
export function pushScalar(state: RendererState, value: number) {
  const history = state.history
  history[state.historyPos] = value
  state.historyPos = (state.historyPos + 1) % history.length
  if (state.historyCount < history.length) state.historyCount++
}

/** Large latest value with a sparkline of recent values. */
export function drawScalar(
  state: RendererState,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  latest: number,
  theme: ChartTheme,
) {
  drawFrame(ctx, width, height, theme)
  const count = state.historyCount
  const history = state.history
  const size = history.length
  if (count > 1) {
    let lo = Infinity
    let hi = -Infinity
    for (let k = 0; k < count; ++k) {
      const v = history[(state.historyPos - count + k + size) % size]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (lo === hi) {
      lo -= 0.5
      hi += 0.5
    }
    const top = height * 0.45
    const plotH = height - top - PAD
    const stepX = (width - 2 * PAD) / (size - 1)
    ctx.strokeStyle = theme.series[0]
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let k = 0; k < count; ++k) {
      const v = history[(state.historyPos - count + k + size) % size]
      const x = PAD + (size - count + k) * stepX
      const y = top + (hi - v) * (plotH / (hi - lo))
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.fillStyle = theme.text
  ctx.font = `500 ${Math.round(height * 0.22)}px ${theme.fontFamily}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(formatNumber(latest), width / 2, height * 0.22)
}

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2)
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(a >= 100 ? 1 : a >= 1 ? 3 : 4)
}
