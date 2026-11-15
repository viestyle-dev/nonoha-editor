// Categorical trace palette for chart nodes (uPlot and Plotly).
//
// A fixed, validated 8-hue order — blue, orange, aqua, yellow, magenta,
// green, violet, red — with separate steps for light and dark surfaces (the
// dark column is the same hues re-stepped, not an automatic flip). The order
// is the colour-vision-deficiency safety mechanism, so slots are always
// assigned in sequence from trace 0.
//
// Validated (OKLab ΔE ×100, Machado 2009 protan/deutan simulation) against
// the editor's chart surfaces — M3 surfaceContainerLow and
// surfaceContainerHighest of the default scheme:
//   light: adjacent CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 19.6; orange, aqua,
//          yellow and magenta sit below 3:1 against the surface, relieved by
//          the always-on legend with live values.
//   dark:  adjacent CVD ΔE ≥ 8.4, normal-vision ΔE ≥ 19.3; all ≥ 3:1.
//
// Hues are never silently cycled: traces past the eighth reuse the hues with
// a dash pattern, so identity never rests on colour alone.

export const CATEGORICAL_LIGHT: readonly string[] = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#6250d6", // violet
  "#e34948", // red
]

export const CATEGORICAL_DARK: readonly string[] = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#0ca30c", // green
  "#9085e9", // violet
  "#e66767", // red
]

export function categoricalPalette(isDark: boolean): readonly string[] {
  return isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
}

export function seriesColor(index: number, palette: readonly string[]): string {
  const n = palette.length
  return palette[((index % n) + n) % n]
}

// Dash patterns (CSS px, uPlot/canvas form) per palette cycle: cycle 0 is
// solid (undefined), later cycles reuse the hues dashed.
export const SERIES_DASHES: ReadonlyArray<readonly number[] | undefined> = [
  undefined,
  [6, 4],
  [2, 3],
  [8, 3, 2, 3],
]

// Plotly's named equivalents of SERIES_DASHES.
export const PLOTLY_SERIES_DASHES = ["solid", "dash", "dot", "dashdot"] as const
export type PlotlySeriesDash = (typeof PLOTLY_SERIES_DASHES)[number]

export function seriesCycle(index: number, paletteLength: number): number {
  if (paletteLength <= 0 || index < 0) return 0
  return Math.floor(index / paletteLength) % SERIES_DASHES.length
}

// Canvas dash for trace `index`; undefined means a solid line. Returns a
// fresh array (uPlot keeps a reference to it).
export function seriesDash(
  index: number,
  paletteLength = CATEGORICAL_LIGHT.length,
): number[] | undefined {
  const dash = SERIES_DASHES[seriesCycle(index, paletteLength)]
  return dash ? [...dash] : undefined
}

export function plotlySeriesDash(
  index: number,
  paletteLength = CATEGORICAL_LIGHT.length,
): PlotlySeriesDash {
  return PLOTLY_SERIES_DASHES[seriesCycle(index, paletteLength)]
}
