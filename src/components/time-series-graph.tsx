import Plotly from "plotly.js-dist-min"
import { CSSProperties, useEffect, useRef } from "react"

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

export default function TimeSeriesGraph(props: TimeSeriesGraphProps) {
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
          color: "grey",
          width: 2,
        },
      },
    ] as Plotly.Shape[],
  })
  const plotDataRef = useRef<TimeSeriesPlotData>(props.plotData)
  plotDataRef.current = props.plotData

  const refPlotlyHTMLElement = useRef<Plotly.PlotlyHTMLElement | null>(null)

  useEffect(() => {
    if (refPlot.current) {
      Plotly.newPlot(
        refPlot.current,
        plotDataRef.current.traces.map(y => {
          return {
            x: plotDataRef.current.x,
            y: y,
            type: "scatter",
            mode: "lines",
          }
        }),
        refLayout.current
      ).then(plotlyHTMLElement => {
        refPlotlyHTMLElement.current = plotlyHTMLElement
        // Apply current yRange after plot is ready (refLayout.current is already up-to-date)
        Plotly.relayout(refPlot.current!, refLayout.current)
      })
    }
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

  useEffect(() => {
    if (refPlot.current == null) {
      return
    }

    refLayout.current.datarevision += 1
    refLayout.current.shapes[0].x0 = plotDataRef.current.cursorPosition
    refLayout.current.shapes[0].x1 = plotDataRef.current.cursorPosition

    Plotly.react(
      refPlot.current,
      plotDataRef.current.traces.map(y => {
        return {
          x: plotDataRef.current.x,
          y: y,
          type: "scatter",
          mode: "lines",
        }
      }),
      refLayout.current
    )
  }, [props.plotData])

  return <div style={props.style} ref={refPlot}></div>
}
