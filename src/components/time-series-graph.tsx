import Plotly from "plotly.js-dist-min"
import { CSSProperties, useEffect, useRef } from "react"

import { useChartTheme } from "@/src/hooks/use-chart-theme"
import { useRafPainter } from "@/src/hooks/use-raf-painter"
import {
  applyPlotlyTheme,
  ChartTheme,
  plotlyLineStyle,
} from "@/src/lib/chart-theme"

export interface TimeSeriesPlotData {
  x: number[]
  traces: number[][]
  cursorPosition: number
}

export interface TimeSeriesGraphProps {
  style?: CSSProperties
  plotData: TimeSeriesPlotData
  graphWidth: number
  graphHeight: number
  yRange?: { min?: number; max?: number }
}

function buildTraces(
  plotData: TimeSeriesPlotData,
  theme: ChartTheme,
): Plotly.Data[] {
  return plotData.traces.map((y, i) => {
    return {
      x: plotData.x,
      y: y,
      type: "scatter",
      mode: "lines",
      line: plotlyLineStyle(theme, i),
    }
  })
}

export default function TimeSeriesGraph(props: TimeSeriesGraphProps) {
  const theme = useChartTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  const refPlot = useRef<HTMLDivElement>(null)
  const refLayout = useRef<{
    width: number
    height: number
    margin: { l: number; r: number; t: number; b: number }
    uirevision: string
    xaxis: { autorange: boolean }
    yaxis: {
      autorange: boolean
      range?: [number, number]
      autorangeoptions?: { minallowed?: number; maxallowed?: number }
    }
    datarevision: number
    shapes: Plotly.Shape[]
  }>({
    width: props.graphWidth,
    height: props.graphHeight,
    margin: { l: 40, r: 40, t: 40, b: 40 },
    uirevision: "true",
    xaxis: { autorange: true },
    yaxis: { autorange: true },
    datarevision: 0,
    shapes: [
      {
        type: "line",
        x0: 0,
        x1: 0,
        y0: 0,
        y1: 1,
        yref: "paper",
        line: {
          color: theme.cursor,
          width: 1.5,
        },
      },
    ] as Plotly.Shape[],
  })
  const plotDataRef = useRef<TimeSeriesPlotData>(props.plotData)
  plotDataRef.current = props.plotData

  const refPlotlyHTMLElement = useRef<Plotly.PlotlyHTMLElement | null>(null)

  // Colours/fonts from the theme, merged into the mutable layout.
  const applyTheme = (t: ChartTheme) => {
    applyPlotlyTheme(refLayout.current, t)
    refLayout.current.shapes[0].line = {
      ...refLayout.current.shapes[0].line,
      color: t.cursor,
    }
  }

  useEffect(() => {
    if (refPlot.current) {
      applyTheme(themeRef.current)
      Plotly.newPlot(
        refPlot.current,
        buildTraces(plotDataRef.current, themeRef.current),
        refLayout.current
      ).then(plotlyHTMLElement => {
        refPlotlyHTMLElement.current = plotlyHTMLElement
        // Apply current yRange after plot is ready (refLayout.current is already up-to-date)
        Plotly.relayout(refPlot.current!, refLayout.current)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Update yaxis in refLayout (runs even if plot not ready yet)
    const yRange = props.yRange
    if (yRange?.min !== undefined && yRange?.max !== undefined) {
      refLayout.current.yaxis.autorange = false
      refLayout.current.yaxis.range = [yRange.min, yRange.max]
      delete refLayout.current.yaxis.autorangeoptions
    } else if (yRange?.min !== undefined) {
      refLayout.current.yaxis.autorange = true
      refLayout.current.yaxis.autorangeoptions = { minallowed: yRange.min }
      delete refLayout.current.yaxis.range
    } else if (yRange?.max !== undefined) {
      refLayout.current.yaxis.autorange = true
      refLayout.current.yaxis.autorangeoptions = { maxallowed: yRange.max }
      delete refLayout.current.yaxis.range
    } else {
      refLayout.current.yaxis.autorange = true
      delete refLayout.current.yaxis.range
      delete refLayout.current.yaxis.autorangeoptions
    }

    if (!refPlotlyHTMLElement.current || !refPlot.current) {
      return
    }

    refLayout.current.width = props.graphWidth
    refLayout.current.height = props.graphHeight

    Plotly.relayout(refPlot.current, refLayout.current)
  }, [props.graphWidth, props.graphHeight, props.yRange])

  // Draws the latest plotData; at most once per animation frame.
  const painter = useRafPainter(() => {
    if (refPlot.current == null) {
      return
    }

    refLayout.current.datarevision += 1
    refLayout.current.shapes[0].x0 = plotDataRef.current.cursorPosition
    refLayout.current.shapes[0].x1 = plotDataRef.current.cursorPosition

    Plotly.react(
      refPlot.current,
      buildTraces(plotDataRef.current, themeRef.current),
      refLayout.current
    )
  })

  useEffect(() => {
    painter.schedule()
  }, [props.plotData, painter])

  // Theme change: restyle layout + traces in place on the next frame.
  const isFirstThemeRef = useRef(true)
  useEffect(() => {
    if (isFirstThemeRef.current) {
      isFirstThemeRef.current = false
      return
    }
    applyTheme(theme)
    painter.schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, painter])

  return <div style={props.style} ref={refPlot}></div>
}
