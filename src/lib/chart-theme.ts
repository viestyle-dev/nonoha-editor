// Chart colours and typography derived from the editor's Material 3 theme.
//
// Chart nodes render on the node Paper (surfaceContainerHighest). The chart
// panel itself stays transparent so axes, legend and toolbar sit on the node
// surface; only the plot area gets its own recessed fill
// (surfaceContainerLow), which also gives data ink more contrast in both
// modes. Pure functions: no React or DOM, so it is unit-testable.

import type { MaterialColors } from "@/src/stores/theme-store"

import {
  categoricalPalette,
  PlotlySeriesDash,
  plotlySeriesDash,
  seriesColor,
} from "./chart-palette"

export const DEFAULT_CHART_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export interface ChartTheme {
  isDark: boolean
  /** Panel behind axes/legend/toolbar (matches the node surface). */
  background: string
  /** Fill of the plot area (inside the axes). */
  plotBackground: string
  /** Tick labels and axis titles. */
  axis: string
  /** Axis lines, zero lines, tick marks. */
  axisLine: string
  /** Grid hairlines. */
  grid: string
  /** Legend labels and other primary chart text. */
  text: string
  /** Legend values and secondary chart text. */
  textMuted: string
  /** Ring-buffer write-head line. */
  cursor: string
  /** Hover crosshair. */
  crosshair: string
  /** Drag-to-zoom selection box. */
  selection: string
  /** Toolbar icons (idle / hover / active). */
  icon: string
  iconHover: string
  accent: string
  /** Hover tooltip. */
  tooltipBackground: string
  tooltipText: string
  tooltipBorder: string
  fontFamily: string
  fontSize: number
  /** Categorical trace colours in slot order. */
  series: readonly string[]
}

export function deriveChartTheme(
  colors: MaterialColors,
  isDark: boolean,
  fontFamily?: string,
): ChartTheme {
  return {
    isDark,
    background: colors.surfaceContainerHighest,
    plotBackground: colors.surfaceContainerLow,
    axis: colors.onSurfaceVariant,
    axisLine: colors.outline,
    grid: colors.outlineVariant,
    text: colors.onSurface,
    textMuted: colors.onSurfaceVariant,
    cursor: colors.outline,
    crosshair: colors.outline,
    selection: withAlpha(colors.primary, 0.16),
    icon: colors.onSurfaceVariant,
    iconHover: colors.onSurface,
    accent: colors.primary,
    tooltipBackground: colors.inverseSurface,
    tooltipText: colors.inverseOnSurface,
    tooltipBorder: colors.outline,
    fontFamily: fontFamily || DEFAULT_CHART_FONT_FAMILY,
    fontSize: 11,
    series: categoricalPalette(isDark),
  }
}

// "#rgb" / "#rrggbb" -> "rgba(r, g, b, a)". Other inputs pass through.
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  let hex = m[1]
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map(c => c + c)
      .join("")
  }
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Trace colour: an explicit override list wins, else the theme palette.
export function traceColor(
  theme: ChartTheme,
  index: number,
  override?: readonly string[],
): string {
  const palette = override && override.length > 0 ? override : theme.series
  return seriesColor(index, palette)
}

// ---------------------------------------------------------------------------
// Plotly
// ---------------------------------------------------------------------------

const TRANSPARENT = "rgba(0,0,0,0)"

export function plotlyAxisTheme(theme: ChartTheme) {
  return {
    color: theme.axis,
    gridcolor: theme.grid,
    zerolinecolor: theme.axisLine,
    linecolor: theme.axisLine,
    tickcolor: theme.axisLine,
  }
}

export function plotlySceneAxisTheme(theme: ChartTheme) {
  return {
    ...plotlyAxisTheme(theme),
    backgroundcolor: theme.plotBackground,
    showbackground: true,
  }
}

export function plotlyLayoutTheme(theme: ChartTheme) {
  return {
    paper_bgcolor: TRANSPARENT,
    plot_bgcolor: theme.plotBackground,
    font: {
      family: theme.fontFamily,
      size: theme.fontSize,
      color: theme.axis,
    },
    colorway: [...theme.series],
    legend: {
      bgcolor: TRANSPARENT,
      font: { color: theme.text },
    },
    modebar: {
      bgcolor: TRANSPARENT,
      color: theme.icon,
      activecolor: theme.accent,
    },
    hoverlabel: {
      font: { family: theme.fontFamily },
    },
  }
}

function ensureObject(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = target[key]
  if (current && typeof current === "object") {
    return current as Record<string, unknown>
  }
  const created: Record<string, unknown> = {}
  target[key] = created
  return created
}

// Mutates a Plotly layout in place (the chart components keep their layout
// in a ref and mutate it), merging theme colours into the existing axis
// objects so ranges/autorange settings survive. `scene` also themes the 3-D
// scene axes.
export function applyPlotlyTheme(
  layout: object,
  theme: ChartTheme,
  options: { cartesian?: boolean; scene?: boolean } = {},
): void {
  const { cartesian = true, scene = false } = options
  const target = layout as Record<string, unknown>
  Object.assign(target, plotlyLayoutTheme(theme))

  if (cartesian) {
    const axis = plotlyAxisTheme(theme)
    Object.assign(ensureObject(target, "xaxis"), axis)
    Object.assign(ensureObject(target, "yaxis"), axis)
  }
  if (scene) {
    const sceneLayout = ensureObject(target, "scene")
    sceneLayout.bgcolor = TRANSPARENT
    const axis = plotlySceneAxisTheme(theme)
    for (const key of ["xaxis", "yaxis", "zaxis"]) {
      Object.assign(ensureObject(sceneLayout, key), axis)
    }
  }
}

// Line style for trace `index` of a Plotly line chart.
export function plotlyLineStyle(
  theme: ChartTheme,
  index: number,
  width = 1.5,
): { color: string; width: number; dash: PlotlySeriesDash } {
  return {
    color: seriesColor(index, theme.series),
    width,
    dash: plotlySeriesDash(index, theme.series.length),
  }
}

// Heatmap/surface colorbar styling that follows the theme.
export function plotlyColorbarTheme(theme: ChartTheme) {
  return {
    outlinewidth: 0,
    tickcolor: theme.axisLine,
    tickfont: { color: theme.axis, family: theme.fontFamily, size: theme.fontSize },
  }
}
