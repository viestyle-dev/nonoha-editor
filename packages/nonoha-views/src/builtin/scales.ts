// Pure helpers shared by the built-in views: dB conversion, axis ticks,
// spectrum-bin to display-row mapping and audio block statistics.
// No DOM access, no allocation in the per-value functions.

/** dB value used for silence / invalid input. */
export const DB_FLOOR = -200

/** 10 log10(power); DB_FLOOR for power <= 1e-20 or NaN. */
export function powerToDb(power: number): number {
  return power > 1e-20 ? 10 * Math.log10(power) : DB_FLOOR
}

/** 20 log10(|amplitude|); DB_FLOOR for |amplitude| <= 1e-10 or NaN. */
export function amplitudeToDb(amplitude: number): number {
  const a = amplitude < 0 ? -amplitude : amplitude
  return a > 1e-10 ? 20 * Math.log10(a) : DB_FLOOR
}

/** dB of a log10(power) value (10 x); DB_FLOOR for NaN / -Infinity. */
export function log10PowerToDb(value: number): number {
  const db = 10 * value
  return db > DB_FLOOR ? db : DB_FLOOR
}

/** Position of `db` in [minDb, maxDb] as 0-1 (clamped). */
export function dbToUnit(db: number, minDb: number, maxDb: number): number {
  if (!(maxDb > minDb)) return 0
  const t = (db - minDb) / (maxDb - minDb)
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

const clean = (x: number) => Number(x.toPrecision(12))

/**
 * Tick values for a frequency axis over [fMin, fMax]: 1-2-5 per decade on a
 * log axis (thinned to decades when crowded), nice steps on a linear one.
 */
export function frequencyTicks(fMin: number, fMax: number, log: boolean, maxTicks: number): number[] {
  const ticks: number[] = []
  if (!(fMax > fMin) || maxTicks < 1) return ticks
  if (log) {
    if (!(fMin > 0)) return ticks
    const d0 = Math.floor(Math.log10(fMin))
    const d1 = Math.ceil(Math.log10(fMax))
    for (const mantissas of [[1, 2, 5], [1]]) {
      ticks.length = 0
      for (let d = d0; d <= d1; ++d) {
        for (const m of mantissas) {
          const f = clean(m * Math.pow(10, d))
          if (f >= fMin * (1 - 1e-9) && f <= fMax * (1 + 1e-9)) ticks.push(f)
        }
      }
      if (ticks.length <= maxTicks) return ticks
    }
    const stride = Math.ceil(ticks.length / maxTicks)
    return ticks.filter((_, i) => i % stride === 0)
  }
  const raw = (fMax - fMin) / maxTicks
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  let step = magnitude * 10
  for (const m of [1, 2, 5, 10]) {
    if (m * magnitude >= raw) {
      step = m * magnitude
      break
    }
  }
  for (let f = Math.ceil(fMin / step) * step; f <= fMax * (1 + 1e-9); f += step) ticks.push(clean(f))
  return ticks
}

/** Short frequency label: 0.05, 2.5, 440, 1.5k, 20k. */
export function formatFrequency(f: number): string {
  const a = Math.abs(f)
  if (a >= 1000) return `${Number((f / 1000).toFixed(a >= 10000 ? 0 : 1))}k`
  if (a >= 100) return String(Math.round(f))
  if (a >= 1) return String(Number(f.toFixed(1)))
  if (a === 0) return '0'
  return String(Number(f.toPrecision(2)))
}

/**
 * Display rows (0 = bottom) of a frequency axis mapped to spectrum bins.
 * Row r shows the max of bins [lo, hi) when it spans at least one bin
 * (hi >= 0), else bin lo interpolated toward lo + 1 by frac (hi = -1).
 */
export interface RowMap {
  rows: number
  bins: number
  lo: Int32Array
  hi: Int32Array
  frac: Float32Array
  /** Axis value (frequency, or log10 frequency on a log axis) at the bottom and top. */
  uMin: number
  uMax: number
  log: boolean
  /** Scratch: axis value per bin. */
  u: Float64Array
}

export function createRowMap(): RowMap {
  return {
    rows: 0,
    bins: 0,
    lo: new Int32Array(0),
    hi: new Int32Array(0),
    frac: new Float32Array(0),
    uMin: 0,
    uMax: 0,
    log: false,
    u: new Float64Array(0),
  }
}

/** Fractional bin index of axis value `x` over u[first..last] (ascending). */
function fractionalBin(u: Float64Array, first: number, last: number, x: number): number {
  if (x <= u[first]) return first
  if (x >= u[last]) return last
  let lo = first
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (u[mid] <= x) lo = mid
    else hi = mid
  }
  const span = u[hi] - u[lo]
  return span > 0 ? lo + (x - u[lo]) / span : lo
}

/**
 * Fill `map` for `rows` display rows and `bins` spectrum bins. Bin k is at
 * frequency freqs[k] (or k without freqs). A log axis skips bins at f <= 0.
 * Buffers grow only when rows or bins exceed their capacity.
 */
export function buildRowMap(map: RowMap, rows: number, bins: number, freqs: ArrayLike<number> | null, log: boolean): void {
  if (map.lo.length < rows) {
    map.lo = new Int32Array(rows)
    map.hi = new Int32Array(rows)
    map.frac = new Float32Array(rows)
  }
  if (map.u.length < bins) map.u = new Float64Array(bins)
  map.rows = rows
  map.bins = bins
  map.log = log
  const u = map.u
  let first = 0
  for (let k = 0; k < bins; ++k) {
    const f = freqs ? freqs[k] : k
    u[k] = log ? (f > 0 ? Math.log10(f) : -Infinity) : f
  }
  if (log) while (first < bins - 1 && !(u[first] > -Infinity)) ++first
  const last = bins - 1
  map.uMin = bins > 0 ? u[first] : 0
  map.uMax = bins > 0 ? u[last] : 0
  const span = map.uMax - map.uMin
  if (!(span > 0) || bins < 2) {
    for (let r = 0; r < rows; ++r) {
      map.lo[r] = Math.max(0, first)
      map.hi[r] = -1
      map.frac[r] = 0
    }
    return
  }
  for (let r = 0; r < rows; ++r) {
    const a = map.uMin + (span * r) / rows
    const b = map.uMin + (span * (r + 1)) / rows
    const pa = fractionalBin(u, first, last, a)
    const pb = fractionalBin(u, first, last, b)
    if (pb - pa >= 1) {
      const lo = Math.round(pa)
      map.lo[r] = lo
      map.hi[r] = r === rows - 1 ? bins : Math.min(bins, Math.max(lo + 1, Math.round(pb)))
      map.frac[r] = 0
    } else {
      const pc = fractionalBin(u, first, last, (a + b) / 2)
      const lo = Math.min(last, Math.floor(pc))
      map.lo[r] = lo
      map.hi[r] = -1
      map.frac[r] = pc - lo
    }
  }
}

/** Value of display row r from `values` (bins long, starting at `offset`). */
export function rowValue(map: RowMap, values: ArrayLike<number>, offset: number, r: number): number {
  const lo = map.lo[r]
  const hi = map.hi[r]
  let v = values[offset + lo]
  if (hi < 0) {
    const f = map.frac[r]
    if (f > 0 && lo + 1 < map.bins) v += (values[offset + lo + 1] - v) * f
    return v
  }
  for (let k = lo + 1; k < hi; ++k) {
    const x = values[offset + k]
    if (x > v) v = x
  }
  return v
}

/** Axis position 0 (bottom) - 1 (top) of frequency f on `map`'s axis; NaN off-axis. */
export function frequencyToUnit(map: RowMap, f: number): number {
  const x = map.log ? (f > 0 ? Math.log10(f) : NaN) : f
  const span = map.uMax - map.uMin
  return span > 0 ? (x - map.uMin) / span : NaN
}

/**
 * Accumulate interleaved frames (`data.length / channels` frames) into
 * per-channel sums of squares and absolute peaks. NaN samples are skipped.
 * Returns the number of frames.
 */
export function accumulateBlock(data: ArrayLike<number>, channels: number, sumSq: Float64Array, peak: Float32Array): number {
  const n = data.length - (data.length % channels)
  let c = 0
  for (let i = 0; i < n; ++i) {
    const x = data[i]
    if (x === x) {
      sumSq[c] += x * x
      const a = x < 0 ? -x : x
      if (a > peak[c]) peak[c] = a
    }
    if (++c === channels) c = 0
  }
  return n / channels
}

/** dB step for meter ticks so that ticks are at least `minSpacing` px apart. */
export function meterTickStep(minDb: number, lengthPx: number, minSpacing: number): number {
  const range = Math.abs(minDb)
  for (const step of [1, 2, 3, 6, 10, 12, 20, 30, 60]) {
    if ((lengthPx * step) / range >= minSpacing) return step
  }
  return range
}

/** Meter ticks 0, -step, ... down to minDb. */
export function meterTicks(minDb: number, step: number): number[] {
  const ticks: number[] = []
  if (!(step > 0) || !(minDb < 0)) return [0]
  for (let db = 0; db >= minDb - 1e-9; db -= step) ticks.push(db)
  return ticks
}

/** A level falling toward `target` at `rate` per second (rises instantly). */
export function fallToward(current: number, target: number, dt: number, rate: number): number {
  if (target >= current) return target
  const next = current - rate * dt
  return next > target ? next : target
}
