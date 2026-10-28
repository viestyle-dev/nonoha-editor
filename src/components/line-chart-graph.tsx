import Plotly, { TypedArray } from "plotly.js-dist-min"
import { CSSProperties, useEffect, useRef } from "react"

export interface LineChartPlotData {
  x: number[] | Float32Array | undefined
  traces: (number[] | TypedArray)[]
}

export interface LineChartGraphProps {
  style?: CSSProperties
  plotData: LineChartPlotData
  graphWidth: number
  graphHeight: number
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
}

export default function LineChartGraph(props: LineChartGraphProps) {
  const refPlot = useRef<HTMLDivElement>(null)
  const refLayout = useRef<{
    width: number
    height: number
    margin: { l: number; r: number; t: number; b: number }
    uirevision: string
    xaxis: { autorange: boolean; range?: [number, number] }
    yaxis: {
      autorange: boolean
      range?: [number, number]
      autorangeoptions?: { minallowed?: number; maxallowed?: number }
    }
    datarevision: number
  }>({
    width: props.graphWidth,
    height: props.graphHeight,
    margin: { l: 40, r: 40, t: 40, b: 40 },
    uirevision: "true",
    xaxis: {
      autorange: props.xMin === undefined || props.xMax === undefined,
      range: (props.xMin !== undefined && props.xMax !== undefined)
        ? [props.xMin, props.xMax]
        : undefined,
    },
    yaxis: {
      autorange: props.yMin === undefined || props.yMax === undefined,
      range: (props.yMin !== undefined && props.yMax !== undefined)
        ? [props.yMin, props.yMax]
        : undefined,
    },
    datarevision: 0,
  })
  const plotDataRef = useRef<LineChartPlotData>(props.plotData)
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
      })
    }
  }, [])

  useEffect(() => {
    if (!refPlotlyHTMLElement.current || !refPlot.current) {
      return
    }

    refLayout.current.width = props.graphWidth
    refLayout.current.height = props.graphHeight

    Plotly.relayout(refPlot.current, refLayout.current)
  }, [props.graphWidth, props.graphHeight])

  useEffect(() => {
    if (!refPlotlyHTMLElement.current || !refPlot.current) {
      return
    }

    // Update X axis ranges
    if (props.xMin !== undefined && props.xMax !== undefined) {
      refLayout.current.xaxis.autorange = false
      refLayout.current.xaxis.range = [props.xMin, props.xMax]
    } else {
      refLayout.current.xaxis.autorange = true
      refLayout.current.xaxis.range = undefined
    }

    // Update Y axis ranges with autorangeoptions support
    if (props.yMin !== undefined && props.yMax !== undefined) {
      refLayout.current.yaxis.autorange = false
      refLayout.current.yaxis.range = [props.yMin, props.yMax]
      delete refLayout.current.yaxis.autorangeoptions
    } else if (props.yMin !== undefined) {
      refLayout.current.yaxis.autorange = true
      refLayout.current.yaxis.autorangeoptions = { minallowed: props.yMin }
      refLayout.current.yaxis.range = undefined
    } else if (props.yMax !== undefined) {
      refLayout.current.yaxis.autorange = true
      refLayout.current.yaxis.autorangeoptions = { maxallowed: props.yMax }
      refLayout.current.yaxis.range = undefined
    } else {
      refLayout.current.yaxis.autorange = true
      refLayout.current.yaxis.range = undefined
      delete refLayout.current.yaxis.autorangeoptions
    }

    Plotly.relayout(refPlot.current, refLayout.current)
  }, [props.xMin, props.xMax, props.yMin, props.yMax])

  useEffect(() => {
    if (refPlot.current == null) {
      return
    }

    refLayout.current.datarevision += 1

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

  return <div style={{...props.style, width: props.graphWidth, height: props.graphHeight, minWidth: props.graphWidth, minHeight: props.graphHeight}} ref={refPlot}></div>
}