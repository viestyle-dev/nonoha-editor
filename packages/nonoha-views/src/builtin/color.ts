// Color helpers for views: parse theme colors once (on mount / theme change)
// and turn them into lookup tables, so drawing never parses strings.

/** r, g, b, a in 0-255. */
export type Rgba = [number, number, number, number]

function hexByte(hex: string, i: number, short: boolean): number {
  return short ? parseInt(hex[i] + hex[i], 16) : parseInt(hex.slice(i * 2, i * 2 + 2), 16)
}

function channel(text: string, scale: number): number {
  const value = parseFloat(text)
  if (!isFinite(value)) return NaN
  return text.endsWith('%') ? (value / 100) * scale : value
}

/** Parse "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", "rgb()/rgba()" (comma or space syntax). Null if unknown. */
export function parseColor(css: string): Rgba | null {
  const s = css.trim().toLowerCase()
  if (s === 'transparent') return [0, 0, 0, 0]
  if (s[0] === '#') {
    const hex = s.slice(1)
    if (!/^[0-9a-f]+$/.test(hex)) return null
    if (hex.length === 3 || hex.length === 4) {
      return [hexByte(hex, 0, true), hexByte(hex, 1, true), hexByte(hex, 2, true), hex.length === 4 ? hexByte(hex, 3, true) : 255]
    }
    if (hex.length === 6 || hex.length === 8) {
      return [hexByte(hex, 0, false), hexByte(hex, 1, false), hexByte(hex, 2, false), hex.length === 8 ? hexByte(hex, 3, false) : 255]
    }
    return null
  }
  const match = /^rgba?\(([^)]*)\)$/.exec(s)
  if (!match) return null
  const parts = match[1].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return null
  const r = channel(parts[0], 255)
  const g = channel(parts[1], 255)
  const b = channel(parts[2], 255)
  const a = parts.length === 4 ? channel(parts[3], 1) * 255 : 255
  if (!(isFinite(r) && isFinite(g) && isFinite(b) && isFinite(a))) return null
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return [clamp(r), clamp(g), clamp(b), clamp(a)]
}

let probe: CanvasRenderingContext2D | null = null

/**
 * Any CSS color to RGBA: parseColor first, then the browser (named colors,
 * hsl(), oklch(), ...) through a 1x1 canvas. Gray when nothing works.
 */
export function resolveColor(css: string): Rgba {
  const parsed = parseColor(css)
  if (parsed) return parsed
  if (typeof document !== 'undefined') {
    if (!probe) probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (probe) {
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = '#808080'
      probe.fillStyle = css
      probe.fillRect(0, 0, 1, 1)
      const d = probe.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3]]
    }
  }
  return [128, 128, 128, 255]
}

export function mixColor(a: Rgba, b: Rgba, t: number): Rgba {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]
}

export function rgbaString(c: Rgba, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${((c[3] / 255) * alpha).toFixed(3)})`
}

/**
 * RGBA lookup table (size x 4 bytes) interpolating `stops` linearly.
 * `positions` (0-1, ascending) default to evenly spaced.
 */
export function gradientLut(stops: readonly Rgba[], size = 256, positions?: readonly number[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(size * 4)
  const n = stops.length
  if (n === 0) return lut
  for (let i = 0; i < size; ++i) {
    const t = size > 1 ? i / (size - 1) : 0
    let k = 0
    while (k < n - 2 && t > (positions ? positions[k + 1] : (k + 1) / (n - 1))) ++k
    const t0 = positions ? positions[k] : k / Math.max(1, n - 1)
    const t1 = positions ? positions[Math.min(k + 1, n - 1)] : (k + 1) / Math.max(1, n - 1)
    const a = stops[k]
    const b = stops[Math.min(k + 1, n - 1)]
    const f = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0
    lut[i * 4] = a[0] + (b[0] - a[0]) * f
    lut[i * 4 + 1] = a[1] + (b[1] - a[1]) * f
    lut[i * 4 + 2] = a[2] + (b[2] - a[2]) * f
    lut[i * 4 + 3] = a[3] + (b[3] - a[3]) * f
  }
  return lut
}

/** matplotlib viridis at 0, 0.1, ..., 1. */
export const VIRIDIS: readonly Rgba[] = [
  [68, 1, 84, 255],
  [72, 36, 117, 255],
  [65, 68, 135, 255],
  [53, 95, 141, 255],
  [42, 120, 142, 255],
  [33, 145, 140, 255],
  [34, 168, 132, 255],
  [68, 191, 112, 255],
  [122, 209, 81, 255],
  [189, 223, 38, 255],
  [253, 231, 37, 255],
]
