import { describe, expect, it } from "vitest"

import type { MaterialColors } from "@/src/stores/theme-store"
import {
  CATEGORICAL_DARK,
  CATEGORICAL_LIGHT,
  categoricalPalette,
  plotlySeriesDash,
  seriesColor,
  seriesDash,
} from "@/src/lib/chart-palette"
import {
  applyPlotlyTheme,
  deriveChartTheme,
  DEFAULT_CHART_FONT_FAMILY,
  plotlyLineStyle,
  traceColor,
  withAlpha,
} from "@/src/lib/chart-theme"

// Default-scheme values (SchemeContent, source #3450c3), dark mode.
const DARK: MaterialColors = {
  surface: "#12131a",
  surfaceContainer: "#1e1f26",
  surfaceContainerHighest: "#33343c",
  surfaceContainerHigh: "#292931",
  surfaceContainerLow: "#1a1b22",
  surfaceContainerLowest: "#0d0e15",
  primary: "#b9c3ff",
  secondary: "#bbc4f7",
  tertiary: "#f8acff",
  error: "#ffb4ab",
  onSurface: "#e3e1ec",
  onSurfaceVariant: "#c5c5d6",
  onPrimary: "#001c63",
  onSecondary: "#000000",
  onTertiary: "#000000",
  onError: "#690005",
  outline: "#8e909f",
  outlineVariant: "#444653",
  inverseSurface: "#e3e1ec",
  inverseOnSurface: "#2f3038",
}

describe("chart palette", () => {
  it("has 8 distinct hues per mode and picks by mode", () => {
    expect(new Set(CATEGORICAL_LIGHT).size).toBe(8)
    expect(new Set(CATEGORICAL_DARK).size).toBe(8)
    expect(categoricalPalette(true)).toBe(CATEGORICAL_DARK)
    expect(categoricalPalette(false)).toBe(CATEGORICAL_LIGHT)
  })

  it("assigns slots in order and reuses hues with a dash past the palette", () => {
    expect(seriesColor(0, CATEGORICAL_LIGHT)).toBe("#2a78d6")
    expect(seriesColor(8, CATEGORICAL_LIGHT)).toBe("#2a78d6")
    expect(seriesDash(0)).toBeUndefined()
    expect(seriesDash(7)).toBeUndefined()
    expect(seriesDash(8)).toEqual([6, 4])
    expect(seriesDash(16)).toEqual([2, 3])
    expect(plotlySeriesDash(0)).toBe("solid")
    expect(plotlySeriesDash(9)).toBe("dash")
    expect(plotlySeriesDash(3, 3)).toBe("dash") // custom palette length
  })

  it("returns a fresh dash array each call (uPlot keeps a reference)", () => {
    const a = seriesDash(8)
    const b = seriesDash(8)
    expect(a).not.toBe(b)
  })
})

describe("deriveChartTheme", () => {
  it("maps M3 roles to chart roles", () => {
    const t = deriveChartTheme(DARK, true, "Roboto")
    expect(t.background).toBe(DARK.surfaceContainerHighest)
    expect(t.plotBackground).toBe(DARK.surfaceContainerLow)
    expect(t.axis).toBe(DARK.onSurfaceVariant)
    expect(t.grid).toBe(DARK.outlineVariant)
    expect(t.axisLine).toBe(DARK.outline)
    expect(t.text).toBe(DARK.onSurface)
    expect(t.accent).toBe(DARK.primary)
    expect(t.selection).toBe("rgba(185, 195, 255, 0.16)")
    expect(t.series).toBe(CATEGORICAL_DARK)
    expect(t.fontFamily).toBe("Roboto")
  })

  it("falls back to a system font stack and the light palette", () => {
    const t = deriveChartTheme(DARK, false)
    expect(t.fontFamily).toBe(DEFAULT_CHART_FONT_FAMILY)
    expect(t.series).toBe(CATEGORICAL_LIGHT)
  })

  it("lets an explicit trace colour list override the palette", () => {
    const t = deriveChartTheme(DARK, true)
    expect(traceColor(t, 1)).toBe(CATEGORICAL_DARK[1])
    expect(traceColor(t, 1, ["#000", "#111"])).toBe("#111")
    expect(traceColor(t, 1, [])).toBe(CATEGORICAL_DARK[1])
  })
})

describe("withAlpha", () => {
  it("converts #rgb / #rrggbb and passes other strings through", () => {
    expect(withAlpha("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)")
    expect(withAlpha("#0f8", 1)).toBe("rgba(0, 255, 136, 1)")
    expect(withAlpha("#123456", 2)).toBe("rgba(18, 52, 86, 1)")
    expect(withAlpha("red", 0.5)).toBe("red")
  })
})

describe("applyPlotlyTheme", () => {
  it("merges colours into existing axes without dropping range settings", () => {
    const t = deriveChartTheme(DARK, true)
    const layout = {
      width: 100,
      xaxis: { autorange: true },
      yaxis: { autorange: false, range: [0, 1] as [number, number] },
    }
    applyPlotlyTheme(layout, t)
    expect(layout.yaxis.range).toEqual([0, 1])
    expect(layout.yaxis.autorange).toBe(false)
    const l = layout as unknown as Record<string, Record<string, unknown>>
    expect(l.xaxis.gridcolor).toBe(t.grid)
    expect(l.yaxis.color).toBe(t.axis)
    expect(l.plot_bgcolor as unknown).toBe(t.plotBackground)
    expect(l.paper_bgcolor as unknown).toBe("rgba(0,0,0,0)")
    expect(l.font.family).toBe(t.fontFamily)
  })

  it("themes 3-D scene axes on request and keeps axis object identity", () => {
    const t = deriveChartTheme(DARK, true)
    const zaxis = { range: [0, 5] }
    const layout: Record<string, unknown> = { scene: { zaxis } }
    applyPlotlyTheme(layout, t, { cartesian: false, scene: true })
    const scene = layout.scene as Record<string, Record<string, unknown>>
    expect(scene.zaxis).toBe(zaxis)
    expect(scene.zaxis.backgroundcolor).toBe(t.plotBackground)
    expect(scene.xaxis.gridcolor).toBe(t.grid)
    expect(layout.xaxis).toBeUndefined()
  })

  it("builds per-trace line styles from the palette", () => {
    const t = deriveChartTheme(DARK, true)
    expect(plotlyLineStyle(t, 2)).toEqual({
      color: CATEGORICAL_DARK[2],
      width: 1.5,
      dash: "solid",
    })
    expect(plotlyLineStyle(t, 10).dash).toBe("dash")
  })
})
