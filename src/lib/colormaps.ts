// Sequential colormaps for heatmap-style charts (uPlot raster heatmap and the
// Plotly heatmap/surface). Pure data + helpers, no DOM APIs.
//
// The perceptually uniform maps (viridis, magma, inferno, plasma, cividis)
// are matplotlib's, sampled every 8th entry of the 256-entry tables (33
// stops incl. both ends). Linear interpolation between these stops stays
// within 5/255 per channel of the full tables. "portland" keeps the legacy
// Plotly look for graphs that want it.

export type ColormapName =
  | "viridis"
  | "magma"
  | "inferno"
  | "plasma"
  | "cividis"
  | "portland"

// Viridis spans dark violet -> yellow without approaching the surface tone
// at either end, so it reads on both the light and the dark chart surface.
export const DEFAULT_COLORMAP: ColormapName = "viridis"

export const COLORMAP_OPTIONS: ReadonlyArray<{
  value: ColormapName
  label: string
}> = [
  { value: "viridis", label: "Viridis" },
  { value: "magma", label: "Magma" },
  { value: "inferno", label: "Inferno" },
  { value: "plasma", label: "Plasma" },
  { value: "cividis", label: "Cividis" },
  { value: "portland", label: "Portland (legacy)" },
]

export type ColorStop = readonly [number, readonly [number, number, number]]

// Plotly's built-in "Portland" colorscale stops.
export const PORTLAND_STOPS: ReadonlyArray<ColorStop> = [
  [0.0, [12, 51, 131]],
  [0.25, [10, 136, 186]],
  [0.5, [242, 211, 56]],
  [0.75, [242, 143, 56]],
  [1.0, [217, 30, 30]],
]

// matplotlib tables at indices 0, 8, ..., 248, 255 as concatenated RRGGBB.
const SAMPLED_HEX: Record<Exclude<ColormapName, "portland">, string> = {
  viridis:
    "440154470d6048186a482374472d7b4537814240863e49893b528b375b8d33638d2f6b8e2c728e297a8e26828e23898e21918c1f988b1fa08822a78528ae8032b67a3fbc734ec36b5ec96270cf5784d44b98d83eaddc30c2df23d8e219ece51bfde725",
  magma:
    "0000040303120a0822130d341d114729115a36106b440f7651127c5d177f6a1c81762181832681902a819c2e7faa337db73779c43c75d0416fdc4869e75263ef5d5ef56b5cf9795dfc8961fd9869fea772feb67cfec488fed395fde2a3fcf0b2fcfdbf",
  inferno:
    "0000040403120b0724150b37210c4a2f0a5b3d09654a0c6b57106e64156e71196e7d1e6d8a226a972766a32c61b0315bbc3754c73e4cd24644db503be45a31eb6628f1731df68013f98e09fb9d07fcac11fbbc21f9cb35f5db4cf2ea69f3f68afcffa4",
  plasma:
    "0d08872206903105973f049c4c02a15901a56600a77201a87e03a88a09a59511a1a01a9caa2395b32c8ebc3587c43e7fcc4778d35171da5a6ae06363e66c5ceb7655f0804ef58b47f89540fba139fdac33feb82cfdc527fcd225f8df25f4ed27f0f921",
  cividis:
    "00224e00285b002e6a0533711a386f273e6e32436d3b496c434e6c4b546c535a6d5a5f6e61656f686a716f70737676767d7c788482798c8878938e789b9476a39a74aba072b4a76fbcae6cc4b468cdbb63d5c25edec958e7d150f0d846f9e03afee838",
}

function parseSampledStops(hex: string): ColorStop[] {
  const count = hex.length / 6
  const stops: ColorStop[] = []
  for (let i = 0; i < count; i++) {
    const r = parseInt(hex.slice(i * 6, i * 6 + 2), 16)
    const g = parseInt(hex.slice(i * 6 + 2, i * 6 + 4), 16)
    const b = parseInt(hex.slice(i * 6 + 4, i * 6 + 6), 16)
    // Every 8th table entry; the last stop is entry 255 (t = 1).
    const t = i === count - 1 ? 1 : (i * 8) / 255
    stops.push([t, [r, g, b]])
  }
  return stops
}

const STOPS_CACHE = new Map<ColormapName, ReadonlyArray<ColorStop>>()

export function isColormapName(value: unknown): value is ColormapName {
  return COLORMAP_OPTIONS.some(option => option.value === value)
}

// Saved node data may hold anything (older graphs have no colormap at all);
// unknown values fall back to the default.
export function resolveColormap(value: unknown): ColormapName {
  return isColormapName(value) ? value : DEFAULT_COLORMAP
}

export function colormapStops(name: ColormapName): ReadonlyArray<ColorStop> {
  if (name === "portland") {
    return PORTLAND_STOPS
  }
  let stops = STOPS_CACHE.get(name)
  if (!stops) {
    stops = parseSampledStops(SAMPLED_HEX[name])
    STOPS_CACHE.set(name, stops)
  }
  return stops
}

// 256-entry RGBA lookup table built by linear interpolation between stops.
export function buildLut(stops: ReadonlyArray<ColorStop>): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    // Find the surrounding stops.
    let hi = 1
    while (hi < stops.length - 1 && stops[hi][0] < t) {
      hi++
    }
    const [t0, c0] = stops[hi - 1]
    const [t1, c1] = stops[hi]
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
    lut[i * 4 + 0] = c0[0] + (c1[0] - c0[0]) * f
    lut[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * f
    lut[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * f
    lut[i * 4 + 3] = 255
  }
  return lut
}

export function buildColormapLut(name: ColormapName): Uint8ClampedArray {
  return buildLut(colormapStops(name))
}

// CSS gradient for colorbars. Default direction puts t = 0 at the bottom.
export function colormapCssGradient(
  name: ColormapName,
  direction = "to top",
): string {
  const parts = colormapStops(name).map(
    ([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${roundPct(t * 100)}%`,
  )
  return `linear-gradient(${direction}, ${parts.join(", ")})`
}

// Plotly `colorscale` array ([[0, "rgb(..)"], ..., [1, "rgb(..)"]]).
export function colormapPlotlyScale(name: ColormapName): Array<[number, string]> {
  return colormapStops(name).map(([t, [r, g, b]]) => [t, `rgb(${r},${g},${b})`])
}

function roundPct(v: number): number {
  return Math.round(v * 100) / 100
}
