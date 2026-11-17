import type { PortValue } from 'nonoha-client-js'
import type { ViewTheme } from '../sdk'
import { defineView } from '../sdk'
import { createSurface, font } from './canvas'
import { gradientLut, resolveColor, VIRIDIS } from './color'
import {
  buildRowMap,
  createRowMap,
  DB_FLOOR,
  dbToUnit,
  formatFrequency,
  frequencyTicks,
  frequencyToUnit,
  log10PowerToDb,
  powerToDb,
  RowMap,
  rowValue,
} from './scales'

const COLORMAPS = ['theme', 'viridis'] as const
type Colormap = (typeof COLORMAPS)[number]

/** Rows of the history image are capped (device px of the plot height). */
const MAX_IMAGE_ROWS = 2048

/**
 * Paint one history column (dB values at `history[offset .. offset + bins)`)
 * into RGBA `pixels`: `rows` pixels from the top, `stride` bytes apart,
 * starting at byte `start`. Values at or below DB_FLOOR use LUT entry 0.
 */
export function renderColumn(
  map: RowMap,
  history: ArrayLike<number>,
  offset: number,
  pixels: Uint8ClampedArray,
  start: number,
  stride: number,
  lut: Uint8ClampedArray,
  minDb: number,
  maxDb: number,
): void {
  const rows = map.rows
  const top = (lut.length >> 2) - 1
  for (let y = 0, o = start; y < rows; ++y, o += stride) {
    const v = rowValue(map, history, offset, rows - 1 - y)
    const i = v <= DB_FLOOR ? 0 : ((dbToUnit(v, minDb, maxDb) * top + 0.5) | 0) << 2
    pixels[o] = lut[i]
    pixels[o + 1] = lut[i + 1]
    pixels[o + 2] = lut[i + 2]
    pixels[o + 3] = lut[i + 3]
  }
}

function numericArray(value: PortValue | undefined): Float32Array | Float64Array | null {
  if (!value) return null
  const array = value.array
  if (array instanceof Float32Array || array instanceof Float64Array) return array
  return null
}

/** Rows and row length of a [B, N] value ([N] is one row). */
function rowsOf(value: PortValue): { rows: number; length: number } {
  const shape = value.shape
  if (shape.length >= 2) return { rows: shape[0], length: shape[shape.length - 1] }
  return { rows: 1, length: shape[0] ?? 0 }
}

export const spectrogramView = defineView({
  id: 'spectrogram',
  title: 'Spectrogram',
  description: 'Scrolling heatmap of spectra: each input row becomes one column, newest on the right.',
  inputs: [
    {
      name: 'spectrum',
      accepts: ['f32[?]', 'f64[?]'],
      description: 'Power spectrum per row (linear power; log10 power with inputIsLog10)',
    },
    {
      name: 'freqs',
      accepts: ['f32[?]', 'f64[?]'],
      optional: true,
      description: 'Frequency of each bin in Hz (labels the frequency axis)',
    },
  ],
  settings: {
    columns: { type: 'number', default: 300, min: 10, max: 4000, description: 'History length (rows shown as columns)' },
    logFrequency: { type: 'boolean', default: true, description: 'Logarithmic frequency axis' },
    dbRange: { type: 'number', default: 60, min: 1, max: 300, description: 'Shown dynamic range in dB below the loudest value in view' },
    inputIsLog10: { type: 'boolean', default: false, description: 'Input is log10(power) instead of linear power' },
    colormap: { type: 'string', default: 'theme', enum: [...COLORMAPS], description: 'theme: background to accent to text; or viridis' },
  },
  size: { width: 420, height: 220 },
  mount(element, ctx) {
    const surface = createSurface(element, ctx.size.width, ctx.size.height)
    const g = surface.g
    // History image: one pixel column per history slot, ring-ordered.
    const image = document.createElement('canvas')
    const ig = image.getContext('2d')
    // Colorbar: 1 x 256, top = loudest.
    const bar = document.createElement('canvas')
    bar.width = 1
    bar.height = 256
    const barg = bar.getContext('2d')
    if (!ig || !barg) throw new Error('2D canvas is not available')
    const barPixels = barg.createImageData(1, 256)
    const map = createRowMap()

    let theme: ViewTheme = ctx.theme
    let columns = 0
    let logFrequency = true
    let dbRange = 60
    let inputIsLog10 = false
    let colormap: Colormap = 'theme'

    let bins = 0
    let history = new Float32Array(0) // dB, columns x bins
    let colMax = new Float32Array(0) // loudest dB per slot
    let head = 0 // slot of the newest column
    let filled = 0
    let freqs = new Float64Array(0)
    let freqCount = 0

    let lut = new Uint8ClampedArray(0)
    let pixels: ImageData | null = null
    let imageRows = 0
    let layoutDirty = true
    let rebake = true
    let dirtyColumns = 0
    let bakedTop = NaN
    let hasData = false

    const plot = { x: 0, y: 0, w: 0, h: 0 }
    let showBar = false
    let tickY = new Float32Array(0)
    let tickLabels: string[] = []
    let topLabel = ''
    let bottomLabel = ''
    let labelFont = ''

    function resetHistory() {
      history = new Float32Array(columns * bins)
      colMax = new Float32Array(columns).fill(DB_FLOOR)
      head = columns - 1
      filled = 0
      bakedTop = NaN
      layoutDirty = true
    }

    function readSettings(settings: Readonly<Record<string, unknown>>) {
      // Resolved by the host: numbers within min/max, booleans, a colormap from the enum
      const nextColumns = Math.round(settings.columns as number)
      const nextLog10 = settings.inputIsLog10 as boolean
      const nextColormap = settings.colormap as Colormap
      const nextLogFrequency = settings.logFrequency as boolean
      dbRange = settings.dbRange as number
      const reset = nextColumns !== columns || nextLog10 !== inputIsLog10
      const recolor = nextColormap !== colormap
      if (nextLogFrequency !== logFrequency) layoutDirty = true
      columns = nextColumns
      inputIsLog10 = nextLog10
      colormap = nextColormap
      logFrequency = nextLogFrequency
      if (reset) resetHistory()
      if (recolor) applyTheme()
      rebake = true
    }

    function applyTheme() {
      labelFont = font(10, theme.fontFamily)
      lut =
        colormap === 'viridis'
          ? gradientLut(VIRIDIS)
          : gradientLut([resolveColor(theme.background), resolveColor(theme.accent), resolveColor(theme.text)], 256, [0, 0.6, 1])
      const d = barPixels.data
      for (let y = 0; y < 256; ++y) {
        const i = (255 - y) << 2
        d[y * 4] = lut[i]
        d[y * 4 + 1] = lut[i + 1]
        d[y * 4 + 2] = lut[i + 2]
        d[y * 4 + 3] = 255
      }
      barg!.putImageData(barPixels, 0, 0)
      rebake = true
    }

    function layout() {
      layoutDirty = false
      rebake = true
      const useFreqs = freqCount === bins && bins > 1
      const left = useFreqs ? 36 : 6
      showBar = surface.width >= 220
      const right = showBar ? 46 : 6
      plot.x = left
      plot.y = 6
      plot.w = Math.max(0, surface.width - left - right)
      plot.h = Math.max(0, surface.height - 12)
      const rows = Math.max(1, Math.min(MAX_IMAGE_ROWS, Math.round(plot.h * surface.dpr)))
      if (rows !== imageRows || !pixels || pixels.width !== columns) {
        imageRows = rows
        image.width = Math.max(1, columns)
        image.height = rows
        pixels = ig!.createImageData(Math.max(1, columns), rows)
      }
      if (bins > 0) buildRowMap(map, imageRows, bins, useFreqs ? freqs : null, logFrequency)
      // Frequency ticks (only with known frequencies).
      tickLabels = []
      if (useFreqs && map.uMax > map.uMin) {
        const fMin = logFrequency ? Math.pow(10, map.uMin) : map.uMin
        const fMax = logFrequency ? Math.pow(10, map.uMax) : map.uMax
        const ticks = frequencyTicks(fMin, fMax, logFrequency, Math.max(2, Math.floor(plot.h / 18)))
        tickY = new Float32Array(ticks.length)
        for (let i = 0; i < ticks.length; ++i) {
          tickY[i] = plot.y + plot.h * (1 - frequencyToUnit(map, ticks[i]))
          tickLabels.push(formatFrequency(ticks[i]))
        }
      }
    }

    function currentTop(): number {
      let top = DB_FLOOR
      for (let i = 0; i < columns; ++i) if (colMax[i] > top) top = colMax[i]
      return top
    }

    function renderSlot(slot: number) {
      const top = bakedTop
      renderColumn(map, history, slot * bins, pixels!.data, slot * 4, columns * 4, lut, top - dbRange, top)
    }

    function renderAll() {
      rebake = false
      dirtyColumns = 0
      if (!pixels) return
      pixels.data.fill(0)
      bakedTop = currentTop()
      if (bins > 0) {
        for (let age = 0; age < filled; ++age) renderSlot((head - age + columns) % columns)
      }
      ig!.putImageData(pixels, 0, 0)
      topLabel = bakedTop > DB_FLOOR ? `${Math.round(bakedTop)} dB` : ''
      bottomLabel = bakedTop > DB_FLOOR ? `${Math.round(bakedTop - dbRange)}` : ''
    }

    function flushColumns() {
      const n = Math.min(dirtyColumns, columns)
      dirtyColumns = 0
      if (n <= 0 || !pixels) return
      const start = head - n + 1
      if (start >= 0) {
        ig!.putImageData(pixels, 0, 0, start, 0, n, imageRows)
      } else {
        ig!.putImageData(pixels, 0, 0, 0, 0, head + 1, imageRows)
        ig!.putImageData(pixels, 0, 0, columns + start, 0, -start, imageRows)
      }
    }

    function ingest(src: Float32Array | Float64Array, offset: number) {
      head = (head + 1) % columns
      const base = head * bins
      let max = DB_FLOOR
      for (let k = 0; k < bins; ++k) {
        const v = src[offset + k]
        const db = inputIsLog10 ? log10PowerToDb(v) : powerToDb(v)
        history[base + k] = db
        if (db > max) max = db
      }
      colMax[head] = max
      if (filled < columns) ++filled
      if (!rebake && !layoutDirty) {
        renderSlot(head)
        ++dirtyColumns
      }
    }

    function draw() {
      if (surface.syncPixelRatio()) layoutDirty = true
      if (layoutDirty) layout()
      if (!rebake && filled > 0) {
        // Re-bake when the loudest value moved: louder would clip, quieter wastes range.
        const top = currentTop()
        if (!(top <= bakedTop + 0.5 && top >= bakedTop - 3)) rebake = true
      }
      if (rebake) renderAll()
      else flushColumns()

      surface.begin()
      const width = surface.width
      const height = surface.height
      g.fillStyle = theme.background
      g.fillRect(0, 0, width, height)
      if (plot.w <= 0 || plot.h <= 0) return
      g.font = labelFont
      if (filled > 0 && columns > 0) {
        g.imageSmoothingEnabled = false
        const colW = plot.w / columns
        const older = columns - head - 1
        if (older > 0) g.drawImage(image, head + 1, 0, older, imageRows, plot.x, plot.y, older * colW, plot.h)
        g.drawImage(image, 0, 0, head + 1, imageRows, plot.x + older * colW, plot.y, (head + 1) * colW, plot.h)
      } else {
        g.fillStyle = theme.textMuted
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(hasData ? 'No spectrum rows' : 'Waiting for spectrum…', plot.x + plot.w / 2, plot.y + plot.h / 2)
      }
      g.strokeStyle = theme.grid
      g.lineWidth = 1
      g.strokeRect(plot.x - 0.5, plot.y - 0.5, plot.w + 1, plot.h + 1)

      if (tickLabels.length > 0) {
        g.fillStyle = theme.textMuted
        g.textAlign = 'right'
        g.textBaseline = 'middle'
        g.beginPath()
        for (let i = 0; i < tickLabels.length; ++i) {
          const y = Math.round(tickY[i]) + 0.5
          g.moveTo(plot.x - 4, y)
          g.lineTo(plot.x, y)
          g.fillText(tickLabels[i], plot.x - 6, Math.min(plot.y + plot.h - 5, Math.max(plot.y + 5, y)))
        }
        g.stroke()
      }
      if (showBar) {
        const x = plot.x + plot.w + 6
        g.imageSmoothingEnabled = true
        g.drawImage(bar, x, plot.y, 6, plot.h)
        g.strokeRect(x - 0.5, plot.y - 0.5, 7, plot.h + 1)
        g.fillStyle = theme.textMuted
        g.textAlign = 'left'
        g.textBaseline = 'top'
        g.fillText(topLabel, x + 10, plot.y)
        g.textBaseline = 'bottom'
        g.fillText(bottomLabel, x + 10, plot.y + plot.h)
      }
    }

    readSettings(ctx.settings)
    applyTheme()

    const offSpectrum = ctx.onValues('spectrum', values => {
      const value = values[0]
      const src = numericArray(value)
      if (!src) return
      const { rows, length } = rowsOf(value)
      if (length <= 0 || rows <= 0 || src.length < rows * length) return
      hasData = true
      if (length !== bins) {
        bins = length
        resetHistory()
      }
      // Only the newest `columns` rows can be seen.
      for (let r = Math.max(0, rows - columns); r < rows; ++r) ingest(src, r * length)
      ctx.requestFrame(draw)
    })

    const offFreqs = ctx.onValues('freqs', values => {
      const value = values[0]
      const src = numericArray(value)
      if (!src) return
      const { rows, length } = rowsOf(value)
      if (length <= 0 || rows <= 0 || src.length < rows * length) return
      const offset = (rows - 1) * length
      let same = length === freqCount
      for (let k = 0; same && k < length; ++k) same = freqs[k] === src[offset + k]
      if (same) return
      if (freqs.length < length) freqs = new Float64Array(length)
      for (let k = 0; k < length; ++k) freqs[k] = src[offset + k]
      freqCount = length
      layoutDirty = true
      ctx.requestFrame(draw)
    })

    ctx.requestFrame(draw)

    return {
      resize(width, height) {
        surface.setSize(width, height)
        layoutDirty = true
        ctx.requestFrame(draw)
      },
      settingsChanged(settings) {
        readSettings(settings)
        ctx.requestFrame(draw)
      },
      themeChanged(next) {
        theme = next
        applyTheme()
        ctx.requestFrame(draw)
      },
      destroy() {
        offSpectrum()
        offFreqs()
        surface.destroy()
      },
    }
  },
})
