import type { PortValue } from 'nonoha-client-js'
import type { ViewTheme } from '../sdk'
import { defineView } from '../sdk'
import { createSurface, font } from './canvas'
import { accumulateBlock, amplitudeToDb, dbToUnit, fallToward, meterTicks, meterTickStep } from './scales'

/** Levels above this are drawn in the warm series color. */
const HOT_DB = -6
/** Without new frames for this long, levels fall back to the floor. */
const STALE_SECONDS = 0.3

/** Displayed levels per channel, in dBFS. */
export interface MeterState {
  channels: number
  rms: Float32Array
  peak: Float32Array
  hold: Float32Array
  /** Seconds the hold marker stays before it falls. */
  holdLeft: Float32Array
  /** Seconds the clip lamp stays lit. */
  clipLeft: Float32Array
}

export function createMeterState(channels: number, minDb: number): MeterState {
  return {
    channels,
    rms: new Float32Array(channels).fill(minDb),
    peak: new Float32Array(channels).fill(minDb),
    hold: new Float32Array(channels).fill(minDb),
    holdLeft: new Float32Array(channels),
    clipLeft: new Float32Array(channels),
  }
}

/**
 * Advance channel c by dt seconds toward the block levels `rmsDb`/`peakDb`
 * (pass minDb without fresh data). Bars rise instantly and fall at
 * `fallRate` dB/s; the hold marker stays `holdTime` s, then falls too.
 * Returns true while anything is above the floor or the clip lamp is lit.
 */
export function stepMeterChannel(
  m: MeterState,
  c: number,
  rmsDb: number,
  peakDb: number,
  clipped: boolean,
  dt: number,
  fallRate: number,
  holdTime: number,
  minDb: number,
): boolean {
  m.rms[c] = fallToward(m.rms[c], rmsDb > minDb ? rmsDb : minDb, dt, fallRate)
  const peak = (m.peak[c] = fallToward(m.peak[c], peakDb > minDb ? peakDb : minDb, dt, fallRate))
  if (peak >= m.hold[c]) {
    m.hold[c] = peak
    m.holdLeft[c] = holdTime
  } else if (m.holdLeft[c] > 0) {
    m.holdLeft[c] = Math.max(0, m.holdLeft[c] - dt)
  } else {
    m.hold[c] = Math.max(peak, m.hold[c] - fallRate * dt)
  }
  m.clipLeft[c] = clipped ? holdTime : Math.max(0, m.clipLeft[c] - dt)
  return m.rms[c] > minDb || peak > minDb || m.hold[c] > minDb || m.clipLeft[c] > 0
}

function sampleArray(value: PortValue | undefined): Float32Array | Float64Array | null {
  if (!value) return null
  const array = value.array
  if (array instanceof Float32Array || array instanceof Float64Array) return array
  return null
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export const levelMeterView = defineView({
  id: 'level-meter',
  title: 'Level meter',
  description: 'Per-channel RMS and peak levels in dBFS with peak hold and a clip lamp.',
  inputs: [
    {
      name: 'frames',
      accepts: ['f32', 'f32[?]', 'f32[?x?]', 'f64', 'f64[?]', 'f64[?x?]'],
      delivery: 'every', // levels are measured over all samples
      description: 'Audio samples: rows = samples, last axis = channels (a plain f32 stream is mono)',
    },
  ],
  settings: {
    decay: { type: 'number', default: 1.5, min: 0.05, max: 30, description: 'Seconds the peak hold stays; bars fall the whole scale in this time' },
    minDb: { type: 'number', default: -60, min: -200, max: -6, description: 'Bottom of the scale in dBFS' },
  },
  size: { width: 160, height: 220 },
  mount(element, ctx) {
    const surface = createSurface(element, ctx.size.width, ctx.size.height)
    const g = surface.g
    let theme: ViewTheme = ctx.theme
    let decay = 1.5
    let minDb = -60

    let channels = 0
    let meter = createMeterState(0, minDb)
    // Pending block statistics (merged until the next frame).
    let sumSq = new Float64Array(0)
    let blockPeak = new Float32Array(0)
    let pendingFrames = 0
    // Latest block levels, the target while data is fresh.
    let targetRms = new Float32Array(0)
    let targetPeak = new Float32Array(0)
    let clipNow = new Uint8Array(0)
    let lastData = -Infinity
    let lastFrame = now()

    // Layout.
    let layoutDirty = true
    let vertical = true
    let x0 = 0
    let x1 = 0
    let y0 = 0
    let y1 = 0
    let length = 0
    let slot = 0
    let gap = 0
    let showReadout = false
    let tickUnits = new Float32Array(0)
    let tickLabels: string[] = []
    let readoutKeys = new Int32Array(0)
    let readouts: string[] = []
    let labelFont = ''
    let animating = false
    // The parts that change only with the layout, theme or channel count
    // (background, tracks, ticks, labels), drawn once into this canvas and
    // copied each frame: text is the costly part of a frame.
    const scale = document.createElement('canvas')
    const sg = scale.getContext('2d')
    if (!sg) throw new Error('2D canvas is not available')
    let scaleDirty = true

    function setChannels(n: number) {
      channels = n
      meter = createMeterState(n, minDb)
      sumSq = new Float64Array(n)
      blockPeak = new Float32Array(n)
      targetRms = new Float32Array(n).fill(minDb)
      targetPeak = new Float32Array(n).fill(minDb)
      clipNow = new Uint8Array(n)
      readoutKeys = new Int32Array(n).fill(0x7fffffff)
      readouts = new Array<string>(n).fill('')
      pendingFrames = 0
      layoutDirty = true
      scaleDirty = true
    }

    function readSettings(settings: Readonly<Record<string, unknown>>) {
      // Resolved by the host: numbers within min/max
      decay = settings.decay as number
      const nextMin = settings.minDb as number
      if (nextMin !== minDb) {
        minDb = nextMin
        setChannels(channels)
      }
      layoutDirty = true
    }

    function layout() {
      layoutDirty = false
      scaleDirty = true
      const w = surface.width
      const h = surface.height
      const pad = 6
      const lamp = 5
      vertical = w <= h * 1.33
      const n = Math.max(1, channels)
      if (vertical) {
        x0 = pad + 28
        x1 = w - pad
        slot = Math.max(0, (x1 - x0) / n)
        showReadout = slot >= 26 && h >= 90
        y0 = pad + lamp + 3
        y1 = h - pad - (showReadout ? 14 : 0)
        length = Math.max(0, y1 - y0)
      } else {
        y0 = pad
        y1 = h - pad - 14
        slot = Math.max(0, (y1 - y0) / n)
        showReadout = slot >= 10 && w >= 140
        x0 = pad
        x1 = w - pad - (showReadout ? 40 : 0) - lamp - 3
        length = Math.max(0, x1 - x0)
      }
      gap = Math.min(8, slot * 0.2)
      const step = meterTickStep(minDb, length, vertical ? 16 : 28)
      const ticks = meterTicks(minDb, step)
      tickUnits = new Float32Array(ticks.length)
      tickLabels = ticks.map(db => String(db))
      for (let i = 0; i < ticks.length; ++i) tickUnits[i] = dbToUnit(ticks[i], minDb, 0)
    }

    /** Fill the level span [u0, u1] (0-1 of the scale) across [c0, c1] on `to`. */
    function span(to: CanvasRenderingContext2D, u0: number, u1: number, c0: number, c1: number) {
      if (u1 <= u0) return
      if (vertical) to.fillRect(c0, y1 - u1 * length, c1 - c0, (u1 - u0) * length)
      else to.fillRect(x0 + u0 * length, c0, (u1 - u0) * length, c1 - c0)
    }

    function bar(u: number, hotU: number, c0: number, c1: number) {
      g.fillStyle = theme.accent
      span(g, 0, Math.min(u, hotU), c0, c1)
      if (u > hotU) {
        g.fillStyle = theme.series[1] ?? theme.accent
        span(g, hotU, u, c0, c1)
      }
    }

    /** Background, tracks and the dB scale, at the main canvas's resolution. */
    function drawScale(s: CanvasRenderingContext2D) {
      scaleDirty = false
      const canvas = surface.canvas
      if (scale.width !== canvas.width || scale.height !== canvas.height) {
        scale.width = canvas.width
        scale.height = canvas.height
      }
      const w = surface.width
      const h = surface.height
      s.setTransform(w > 0 ? canvas.width / w : 1, 0, 0, h > 0 ? canvas.height / h : 1, 0, 0)
      s.globalAlpha = 1
      s.fillStyle = theme.background
      s.fillRect(0, 0, w, h)
      s.font = labelFont
      const n = Math.max(1, channels)

      s.globalAlpha = 0.3
      s.fillStyle = theme.grid
      for (let c = 0; c < n; ++c) {
        const c0 = (vertical ? x0 : y0) + c * slot + gap / 2
        span(s, 0, 1, c0, c0 + slot - gap)
      }
      s.globalAlpha = 1
      s.fillStyle = theme.textMuted
      s.strokeStyle = theme.grid
      s.lineWidth = 1
      s.beginPath()
      if (vertical) {
        s.textAlign = 'right'
        s.textBaseline = 'middle'
        for (let i = 0; i < tickUnits.length; ++i) {
          const y = Math.round(y1 - tickUnits[i] * length) + 0.5
          s.moveTo(x0 - 4, y)
          s.lineTo(x0 - 1, y)
          s.fillText(tickLabels[i], x0 - 6, y)
        }
      } else {
        s.textAlign = 'center'
        s.textBaseline = 'top'
        for (let i = 0; i < tickUnits.length; ++i) {
          const x = Math.round(x0 + tickUnits[i] * length) + 0.5
          s.moveTo(x, y1 + 1)
          s.lineTo(x, y1 + 4)
          s.fillText(tickLabels[i], Math.min(w - 10, Math.max(10, x)), y1 + 4)
        }
      }
      s.stroke()

      if (channels === 0) {
        s.textAlign = 'center'
        s.textBaseline = 'middle'
        s.fillText('Waiting for frames…', w / 2, h / 2)
      }
    }

    function draw() {
      const t = now()
      const dt = Math.min(0.1, Math.max(0, (t - lastFrame) / 1000))
      lastFrame = t
      if (surface.syncPixelRatio()) layoutDirty = true
      if (layoutDirty) layout()

      // Fold the pending block into the targets.
      if (pendingFrames > 0) {
        for (let c = 0; c < channels; ++c) {
          targetRms[c] = amplitudeToDb(Math.sqrt(sumSq[c] / pendingFrames))
          targetPeak[c] = amplitudeToDb(blockPeak[c])
          clipNow[c] = blockPeak[c] >= 1 ? 1 : 0
          sumSq[c] = 0
          blockPeak[c] = 0
        }
        pendingFrames = 0
      }
      const fresh = (t - lastData) / 1000 < STALE_SECONDS
      const fallRate = -minDb / decay
      let moving = fresh
      for (let c = 0; c < channels; ++c) {
        if (stepMeterChannel(meter, c, fresh ? targetRms[c] : minDb, fresh ? targetPeak[c] : minDb, clipNow[c] === 1, dt, fallRate, decay, minDb)) moving = true
        clipNow[c] = 0
      }

      if (scaleDirty && sg) drawScale(sg)
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalAlpha = 1
      g.drawImage(scale, 0, 0)
      surface.begin()
      const hotU = dbToUnit(HOT_DB, minDb, 0)
      g.font = labelFont

      for (let c = 0; c < channels; ++c) {
        const c0 = (vertical ? x0 : y0) + c * slot + gap / 2
        const c1 = c0 + slot - gap
        const peakU = dbToUnit(meter.peak[c], minDb, 0)
        const rmsU = dbToUnit(meter.rms[c], minDb, 0)
        g.globalAlpha = 0.35
        bar(peakU, hotU, c0, c1)
        g.globalAlpha = 1
        bar(rmsU, hotU, c0, c1)
        const holdU = dbToUnit(meter.hold[c], minDb, 0)
        if (holdU > 0) {
          g.fillStyle = theme.text
          span(g, Math.max(0, holdU - 2 / Math.max(1, length)), holdU, c0, c1)
        }
        // Clip lamp at the 0 dB end.
        g.globalAlpha = meter.clipLeft[c] > 0 ? 1 : 0.3
        g.fillStyle = meter.clipLeft[c] > 0 ? (theme.series[1] ?? theme.accent) : theme.grid
        if (vertical) g.fillRect(c0, y0 - 8, c1 - c0, 5)
        else g.fillRect(x1 + 3, c0, 5, c1 - c0)
        g.globalAlpha = 1
        if (showReadout) {
          const hold = meter.hold[c]
          const key = hold > minDb ? Math.round(hold * 10) : -0x7fffffff
          if (key !== readoutKeys[c]) {
            readoutKeys[c] = key
            readouts[c] = hold > minDb ? (key / 10).toFixed(1) : '-∞'
          }
          g.fillStyle = theme.textMuted
          if (vertical) {
            g.textAlign = 'center'
            g.textBaseline = 'top'
            g.fillText(readouts[c], (c0 + c1) / 2, y1 + 3)
          } else {
            g.textAlign = 'left'
            g.textBaseline = 'middle'
            g.fillText(readouts[c], x1 + 12, (c0 + c1) / 2)
          }
        }
      }

      animating = moving
      if (animating) ctx.requestFrame(draw)
    }

    function wake() {
      if (!animating) lastFrame = now()
      ctx.requestFrame(draw)
    }

    readSettings(ctx.settings)
    labelFont = font(10, theme.fontFamily)

    const off = ctx.onValues('frames', values => {
      const value = values[0]
      const data = sampleArray(value)
      if (!value || !data || data.length === 0) return
      const shape = value.shape
      const n = shape.length >= 2 ? Math.max(1, shape[shape.length - 1]) : 1
      if (n !== channels) setChannels(n)
      pendingFrames += accumulateBlock(data, n, sumSq, blockPeak)
      lastData = now()
      wake()
    })

    ctx.requestFrame(draw)

    return {
      resize(width, height) {
        surface.setSize(width, height)
        layoutDirty = true
        wake()
      },
      settingsChanged(settings) {
        readSettings(settings)
        wake()
      },
      themeChanged(next) {
        theme = next
        labelFont = font(10, theme.fontFamily)
        scaleDirty = true
        wake()
      },
      destroy() {
        off()
        surface.destroy()
      },
    }
  },
})
