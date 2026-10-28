import Plotly, { Datum, TypedArray } from "plotly.js-dist-min"
import { CSSProperties, useEffect, useRef } from "react"
import { css } from "@emotion/react"

export interface HeatmapPlotData {
  z: number[][]
  cursorPosition: number
}

export interface HeatmapProps {
  style?: CSSProperties
  className?: string
  plotData: HeatmapPlotData
  yLabels?: Datum[] | TypedArray
  layout: {
    width: number
    height: number
  }
  type: "heatmap" | "surface"
  zMin?: number
  zMax?: number
}

export default function HeatmapPlot(props: HeatmapProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef({
    ...props.layout,
    margin: { l: 40, r: 40, t: 40, b: 40 },
    uirevision: "true",
    xaxis: { autorange: true },
    yaxis: { autorange: true },
    datarevision: 0,
  })

  const refCursorShape2d = useRef<Plotly.Shape>({
    type: "line",
    x0: 0,
    x1: 0,
    y0: 0,
    y1: 1,
    yref: "paper",
    line: {
      color: "red",
      width: 2,
    },
  } as Plotly.Shape)

  const refCursorShape3d = useRef<Plotly.PlotData>({
    type: "scatter3d",
    mode: "lines",
    x: [0, 0],
    y: [0, 100],
    z: [0, 0],
    line: {
      color: "red",
      width: 3,
    },
    hoverinfo: "none",
  } as Plotly.PlotData)

  const plotTypeRef = useRef(props.type)
  plotTypeRef.current = props.type

  const plotDataRef = useRef<HeatmapPlotData>(props.plotData)
  plotDataRef.current = props.plotData

  const yLabelsRef = useRef(props.yLabels)
  yLabelsRef.current = props.yLabels

  const zMinRef = useRef(props.zMin)
  zMinRef.current = props.zMin

  const zMaxRef = useRef(props.zMax)
  zMaxRef.current = props.zMax

  useEffect(() => {
    if (plotRef.current) {
      Plotly.newPlot(
        plotRef.current,
        [
          {
            z: plotDataRef.current.z,
            type: plotTypeRef.current,
            // type: "heatmapgl",
            colorscale: "Portland",
            y: yLabelsRef.current,
            zmin: zMinRef.current,
            zmax: zMaxRef.current,
          },
        ],
        layoutRef.current
      )
    }
  }, [])

  useEffect(() => {
    const yLabels = props.yLabels

    if (yLabels) {
      refCursorShape3d.current.y = [yLabels[0], yLabels[yLabels.length - 1]]
    } else {
      refCursorShape3d.current.y = [0, 100]
    }
  }, [props.yLabels])

  useEffect(() => {
    if (plotRef.current == null) {
      return
    }

    const plotType = props.type
    const plotData = plotDataRef.current

    if (plotType === "heatmap") {
      const cursorShape2d = refCursorShape2d.current
      cursorShape2d.x0 = plotData.cursorPosition
      cursorShape2d.x1 = plotData.cursorPosition

      Plotly.react(
        plotRef.current,
        [
          {
            z: plotDataRef.current.z,
            type: plotTypeRef.current,
            colorscale: "Portland",
            y: yLabelsRef.current,
            zmin: zMinRef.current,
            zmax: zMaxRef.current,
          },
        ],
        {
          ...layoutRef.current,
          shapes: [cursorShape2d],
        }
      )
    } else if (plotType === "surface") {
      const cursorShape3d = refCursorShape3d.current
      cursorShape3d.x = [plotData.cursorPosition, plotData.cursorPosition]

      const yLabels = yLabelsRef.current
      if (yLabels) {
        cursorShape3d.y = [yLabels[0], yLabels[yLabels.length - 1]]
      } else {
        cursorShape3d.y = [0, plotData.z.length]
      }

      Plotly.react(
        plotRef.current,
        [
          {
            z: plotDataRef.current.z,
            type: plotTypeRef.current,
            colorscale: "Portland",
            y: yLabelsRef.current,
            cmin: zMinRef.current,
            cmax: zMaxRef.current,
          } as Partial<Plotly.PlotData>,
          cursorShape3d,
        ],
        layoutRef.current
      )
    }
  }, [props.type])

  useEffect(() => {
    if (plotRef.current == null) {
      return
    }

    const plotData = props.plotData
    const plotType = plotTypeRef.current

    layoutRef.current.datarevision += 1
    // layoutRef.current.uirevision = "true"
    layoutRef.current.xaxis.autorange = true
    layoutRef.current.yaxis.autorange = true

    if (plotType === "heatmap") {
      const cursorShape2d = refCursorShape2d.current
      cursorShape2d.x0 = plotData.cursorPosition
      cursorShape2d.x1 = plotData.cursorPosition

      Plotly.react(
        plotRef.current,
        [
          {
            z: props.plotData.z,
            type: plotTypeRef.current,
            colorscale: "Portland",
            y: yLabelsRef.current,
            zmin: zMinRef.current,
            zmax: zMaxRef.current,
          },
        ],
        {
          ...layoutRef.current,
          shapes: [cursorShape2d],
        }
      )
    } else if (plotType === "surface") {
      const cursorShape3d = refCursorShape3d.current
      cursorShape3d.x = [plotData.cursorPosition, plotData.cursorPosition]

      const yLabels = yLabelsRef.current
      if (yLabels) {
        cursorShape3d.y = [yLabels[0], yLabels[yLabels.length - 1]]
      } else {
        cursorShape3d.y = [0, plotData.z.length]
      }

      Plotly.react(
        plotRef.current,
        [
          {
            z: plotData.z,
            type: plotTypeRef.current,
            colorscale: "Portland",
            y: yLabelsRef.current,
            cmin: zMinRef.current,
            cmax: zMaxRef.current,
          } as Partial<Plotly.PlotData>,
          refCursorShape3d.current,
        ],
        layoutRef.current
      )
    }
  }, [props.plotData])

  useEffect(() => {
    if (plotRef.current == null) {
      return
    }

    const plotData = plotDataRef.current
    const plotType = plotTypeRef.current

    if (plotType === "heatmap") {
      const cursorShape2d = refCursorShape2d.current
      cursorShape2d.x0 = plotData.cursorPosition
      cursorShape2d.x1 = plotData.cursorPosition

      Plotly.react(
        plotRef.current,
        [
          {
            z: plotData.z,
            type: plotType,
            colorscale: "Portland",
            y: yLabelsRef.current,
            zmin: props.zMin,
            zmax: props.zMax,
          },
        ],
        {
          ...layoutRef.current,
          shapes: [cursorShape2d],
        }
      )
    } else if (plotType === "surface") {
      Plotly.react(
        plotRef.current,
        [
          {
            z: plotData.z,
            type: plotType,
            colorscale: "Portland",
            y: yLabelsRef.current,
            cmin: props.zMin,
            cmax: props.zMax,
          } as Partial<Plotly.PlotData>,
          refCursorShape3d.current,
        ],
        layoutRef.current
      )
    }
  }, [props.zMin, props.zMax])

  return (
    <div
      style={props.style}
      className={props.className}
      css={css`
        width: ${props.layout.width}px;
        height: ${props.layout.height}px;
      `}
    >
      <div style={props.style} ref={plotRef}></div>
    </div>
  )
}
