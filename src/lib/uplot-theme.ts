// uPlot glue for ChartTheme.
//
// uPlot resolves axis/grid/tick/series strokes through functions on every
// draw, so the options built here read the theme from a ref: a theme change
// only needs `themeRef.current = next` plus a redraw — no rebuild, so data,
// scales and the user's zoom/pan survive. Legend markers are DOM styled once
// at init, hence syncLegendMarkers().

import { css } from "@emotion/react"
import type uPlot from "uplot"

import type { ChartTheme } from "./chart-theme"

export type ChartThemeRef = { readonly current: ChartTheme }

export function chartFont(theme: ChartTheme, weight = ""): string {
  return `${weight ? weight + " " : ""}${theme.fontSize}px ${theme.fontFamily}`
}

// Axis options whose colours follow the theme ref. `extra` (size, values,
// ...) is merged on top.
export function themedAxis(
  themeRef: ChartThemeRef,
  extra: Partial<uPlot.Axis> = {},
): uPlot.Axis {
  return {
    show: true,
    stroke: () => themeRef.current.axis,
    font: chartFont(themeRef.current),
    labelFont: chartFont(themeRef.current, "600"),
    grid: { stroke: () => themeRef.current.grid, width: 1 },
    ticks: { stroke: () => themeRef.current.axisLine, width: 1 },
    ...extra,
  }
}

// drawClear hook: fills the plot area (inside the axes) so the canvas itself
// can stay transparent over the node surface.
export function fillPlotArea(themeRef: ChartThemeRef) {
  return (u: uPlot) => {
    const ctx = u.ctx
    ctx.save()
    ctx.fillStyle = themeRef.current.plotBackground
    ctx.fillRect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height)
    ctx.restore()
  }
}

// Vertical ring-buffer write-head line at data x = `x`.
export function drawWriteHead(u: uPlot, x: number, color: string): void {
  const cursorX = u.valToPos(x, "x", true)
  if (
    !Number.isFinite(cursorX) ||
    cursorX < u.bbox.left ||
    cursorX > u.bbox.left + u.bbox.width
  ) {
    return
  }
  const ctx = u.ctx
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 * (typeof devicePixelRatio === "number" ? devicePixelRatio : 1)
  ctx.beginPath()
  ctx.moveTo(cursorX, u.bbox.top)
  ctx.lineTo(cursorX, u.bbox.top + u.bbox.height)
  ctx.stroke()
  ctx.restore()
}

// Legend whose markers use the trace colour and show dashed traces as dashed.
// (uPlot merges `legend` shallowly, so every marker field is given.)
export function themedLegend(
  colorFor: (seriesIdx: number) => string,
): uPlot.Legend {
  return {
    show: true,
    markers: {
      show: true,
      width: 2,
      stroke: (_u, seriesIdx) => colorFor(seriesIdx),
      fill: () => "transparent",
      dash: (u, seriesIdx) => (u.series[seriesIdx]?.dash ? "dashed" : "solid"),
    },
  }
}

// Re-colours the legend markers after a theme change (uPlot styles them only
// when the legend row is created).
export function syncLegendMarkers(
  u: uPlot,
  colorFor: (seriesIdx: number) => string,
): void {
  const rows = u.root.querySelectorAll<HTMLElement>(".u-legend .u-series")
  rows.forEach((row, i) => {
    if (i === 0) return // x series
    const marker = row.querySelector<HTMLElement>(".u-marker")
    if (marker) {
      marker.style.borderColor = colorFor(i)
    }
  })
}

// Scoped styles for the uPlot DOM (legend, selection box, crosshair).
export function uplotThemeStyles(theme: ChartTheme) {
  return css`
    .uplot {
      font-family: inherit;
      background: transparent;
    }
    .u-legend {
      font-size: ${theme.fontSize}px;
      background: transparent;
      text-align: left;
      padding: 4px;
      color: ${theme.text};
    }
    .u-legend th {
      font-weight: 500;
    }
    .u-series {
      padding: 1px 4px;
    }
    .u-marker {
      width: 12px;
      height: 2px;
    }
    .u-label {
      color: ${theme.text};
    }
    .u-value {
      color: ${theme.textMuted};
      font-variant-numeric: tabular-nums;
    }
    .u-select {
      background: ${theme.selection};
    }
    .u-hz .u-cursor-x,
    .u-vt .u-cursor-y {
      border-right-color: ${theme.crosshair};
    }
    .u-hz .u-cursor-y,
    .u-vt .u-cursor-x {
      border-bottom-color: ${theme.crosshair};
    }
  `
}

// Toolbar icon style (zoom / pan / reset buttons above uPlot charts).
export function toolbarIconStyle(theme: ChartTheme, active: boolean) {
  return css({
    fontSize: 18,
    color: active ? theme.accent : theme.icon,
    cursor: "pointer",
    "&:hover": { color: active ? theme.accent : theme.iconHover },
  })
}

// Tooltip box styling (heatmap cell readout).
export function styleTooltip(el: HTMLElement, theme: ChartTheme): void {
  el.style.background = theme.tooltipBackground
  el.style.color = theme.tooltipText
  el.style.border = `1px solid ${theme.tooltipBorder}`
  el.style.fontFamily = theme.fontFamily
}
