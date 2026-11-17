import { describe, expect, it } from 'vitest'
import { gradientLut, parseColor, VIRIDIS } from '../builtin/color'
import { createMeterState, stepMeterChannel } from '../builtin/level-meter'
import {
  accumulateBlock,
  amplitudeToDb,
  buildRowMap,
  createRowMap,
  DB_FLOOR,
  dbToUnit,
  fallToward,
  formatFrequency,
  frequencyTicks,
  frequencyToUnit,
  log10PowerToDb,
  meterTicks,
  meterTickStep,
  powerToDb,
  rowValue,
} from '../builtin/scales'
import { renderColumn } from '../builtin/spectrogram'
import { builtinViews } from '../builtin'
import { viewDefinitionProblems } from '../manifest'
import { VIEW_SDK_VERSION } from '../sdk'

describe('dB conversion', () => {
  it('converts power, amplitude and log10 power', () => {
    expect(powerToDb(1)).toBe(0)
    expect(powerToDb(0.01)).toBeCloseTo(-20)
    expect(amplitudeToDb(0.1)).toBeCloseTo(-20)
    expect(amplitudeToDb(-1)).toBe(0)
    expect(log10PowerToDb(-3)).toBeCloseTo(-30)
  })

  it('maps silence and NaN to the floor', () => {
    expect(powerToDb(0)).toBe(DB_FLOOR)
    expect(powerToDb(NaN)).toBe(DB_FLOOR)
    expect(amplitudeToDb(0)).toBe(DB_FLOOR)
    expect(log10PowerToDb(NaN)).toBe(DB_FLOOR)
    expect(log10PowerToDb(-Infinity)).toBe(DB_FLOOR)
  })

  it('normalizes into a range, clamped', () => {
    expect(dbToUnit(-30, -60, 0)).toBe(0.5)
    expect(dbToUnit(10, -60, 0)).toBe(1)
    expect(dbToUnit(-90, -60, 0)).toBe(0)
    expect(dbToUnit(-10, 0, 0)).toBe(0)
  })
})

describe('frequency axis', () => {
  it('ticks 1-2-5 per decade on a log axis and thins when crowded', () => {
    expect(frequencyTicks(20, 20000, true, 20)).toEqual([20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000])
    expect(frequencyTicks(20, 20000, true, 4)).toEqual([100, 1000, 10000])
    expect(frequencyTicks(0.05, 3, true, 10)).toEqual([0.05, 0.1, 0.2, 0.5, 1, 2])
  })

  it('ticks nice steps on a linear axis', () => {
    expect(frequencyTicks(0, 1000, false, 5)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(frequencyTicks(0, 7.5, false, 4)).toEqual([0, 2, 4, 6])
  })

  it('formats labels compactly', () => {
    expect(formatFrequency(0.05)).toBe('0.05')
    expect(formatFrequency(2.5)).toBe('2.5')
    expect(formatFrequency(440)).toBe('440')
    expect(formatFrequency(1500)).toBe('1.5k')
    expect(formatFrequency(20000)).toBe('20k')
  })
})

describe('row map', () => {
  it('maps rows to bins on a linear axis (max of the bins a row spans)', () => {
    const map = createRowMap()
    buildRowMap(map, 4, 9, null, false) // 8 bin intervals over 4 rows, rows are [lo, hi)
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    const rows = [0, 1, 2, 3].map(r => rowValue(map, values, 0, r))
    expect(rows).toEqual([1, 3, 5, 8]) // the top row includes the last bin
  })

  it('interpolates when rows are finer than bins', () => {
    const map = createRowMap()
    buildRowMap(map, 4, 2, null, false)
    const values = [0, 4]
    expect([0, 1, 2, 3].map(r => rowValue(map, values, 0, r))).toEqual([0.5, 1.5, 2.5, 3.5])
  })

  it('skips f <= 0 on a log axis and spreads decades evenly', () => {
    const freqs = [0, 1, 10, 100, 1000]
    const map = createRowMap()
    buildRowMap(map, 3, 5, freqs, true)
    expect(map.uMin).toBe(0)
    expect(map.uMax).toBe(3)
    const values = [99, 1, 2, 3, 4] // bin 0 (f = 0) is never read
    expect([0, 1, 2].map(r => rowValue(map, values, 0, r))).toEqual([1, 2, 4])
    expect(frequencyToUnit(map, 100)).toBeCloseTo(2 / 3)
    expect(frequencyToUnit(map, 0)).toBeNaN()
  })

  it('reads at an offset (one history slot)', () => {
    const map = createRowMap()
    buildRowMap(map, 2, 3, null, false)
    const history = [9, 9, 9, 1, 2, 3]
    expect(rowValue(map, history, 3, 1)).toBe(3)
  })

  it('paints a column top-down through the LUT', () => {
    const map = createRowMap()
    buildRowMap(map, 2, 3, null, false)
    const lut = gradientLut([
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ])
    const pixels = new Uint8ClampedArray(2 * 4)
    renderColumn(map, [DB_FLOOR, DB_FLOOR, 0], 0, pixels, 0, 4, lut, -60, 0)
    // Top row = loudest (0 dB, white), bottom row = silence (LUT entry 0).
    expect(Array.from(pixels)).toEqual([255, 255, 255, 255, 0, 0, 0, 255])
  })
})

describe('colors', () => {
  it('parses hex and rgb() colors', () => {
    expect(parseColor('#111318')).toEqual([17, 19, 24, 255])
    expect(parseColor('#fff')).toEqual([255, 255, 255, 255])
    expect(parseColor('#3450c380')).toEqual([52, 80, 195, 128])
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30, 255])
    expect(parseColor('rgba(10,20,30,0.5)')).toEqual([10, 20, 30, 128])
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 128])
    expect(parseColor('oklch(0.5 0.1 200)')).toBeNull()
  })

  it('interpolates gradient stops', () => {
    const lut = gradientLut(
      [
        [0, 0, 0, 255],
        [100, 200, 0, 255],
        [200, 200, 200, 255],
      ],
      5,
      [0, 0.5, 1],
    )
    expect(Array.from(lut.slice(0, 4))).toEqual([0, 0, 0, 255])
    expect(Array.from(lut.slice(4, 8))).toEqual([50, 100, 0, 255])
    expect(Array.from(lut.slice(8, 12))).toEqual([100, 200, 0, 255])
    expect(Array.from(lut.slice(16, 20))).toEqual([200, 200, 200, 255])
    expect(Array.from(gradientLut(VIRIDIS).slice(255 * 4))).toEqual([253, 231, 37, 255])
  })
})

describe('level meter', () => {
  it('accumulates interleaved frames per channel, skipping NaN', () => {
    const sumSq = new Float64Array(2)
    const peak = new Float32Array(2)
    const frames = accumulateBlock(new Float32Array([0.5, -1, -0.5, 0, NaN, 0.25]), 2, sumSq, peak)
    expect(frames).toBe(3)
    expect(sumSq[0]).toBeCloseTo(0.5)
    expect(sumSq[1]).toBeCloseTo(1.0625)
    expect(peak[0]).toBe(0.5)
    expect(peak[1]).toBe(1)
  })

  it('picks tick steps by available length', () => {
    expect(meterTickStep(-60, 200, 16)).toBe(6)
    expect(meterTickStep(-60, 60, 16)).toBe(20)
    expect(meterTicks(-60, 20)).toEqual([0, -20, -40, -60])
  })

  it('rises instantly, falls at a rate, holds the peak, then settles', () => {
    expect(fallToward(-30, -10, 0.1, 40)).toBe(-10)
    expect(fallToward(-10, -60, 0.1, 40)).toBe(-14)
    expect(fallToward(-58, -60, 0.1, 40)).toBe(-60)

    const m = createMeterState(1, -60)
    expect(stepMeterChannel(m, 0, -20, -6, false, 0.016, 40, 1.5, -60)).toBe(true)
    expect(m.rms[0]).toBe(-20)
    expect(m.hold[0]).toBe(-6)
    // Signal stops: bars fall, the hold marker stays for the hold time.
    stepMeterChannel(m, 0, -60, -60, false, 0.5, 40, 1.5, -60)
    expect(m.peak[0]).toBeCloseTo(-26)
    expect(m.hold[0]).toBe(-6)
    stepMeterChannel(m, 0, -60, -60, false, 1.0, 40, 1.5, -60)
    expect(m.hold[0]).toBe(-6)
    stepMeterChannel(m, 0, -60, -60, false, 0.1, 40, 1.5, -60) // hold time over: falls
    expect(m.hold[0]).toBeLessThan(-6)
    let moving = true
    for (let i = 0; i < 100 && moving; ++i) moving = stepMeterChannel(m, 0, -60, -60, false, 0.1, 40, 1.5, -60)
    expect(moving).toBe(false)
  })

  it('keeps the clip lamp lit for the hold time', () => {
    const m = createMeterState(1, -60)
    stepMeterChannel(m, 0, -3, 0, true, 0.016, 40, 1, -60)
    expect(m.clipLeft[0]).toBe(1)
    stepMeterChannel(m, 0, -60, -60, false, 0.6, 40, 1, -60)
    expect(m.clipLeft[0]).toBeCloseTo(0.4)
  })
})

describe('builtinViews', () => {
  it('lists the built-in views with SDK version and unique ids', () => {
    expect(builtinViews.map(v => v.id)).toEqual(['spectrogram', 'level-meter'])
    for (const view of builtinViews) {
      expect(view.sdk).toBe(VIEW_SDK_VERSION)
      expect(typeof view.mount).toBe('function')
      for (const key in view.settings ?? {}) expect(view.settings![key].default).toBeDefined()
      expect(viewDefinitionProblems(view)).toEqual([])
    }
  })
})
