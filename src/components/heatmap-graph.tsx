import Plotly, { Datum, TypedArray } from "plotly.js-dist-min"
import { CSSProperties, useEffect, useRef } from "react"
import { css } from "@emotion/react"

import { useChartTheme } from "@/src/hooks/use-chart-theme"
import { useRafPainter } from "@/src/hooks/use-raf-painter"
import {
  applyPlotlyTheme,
  ChartTheme,
  plotlyColorbarTheme,
} from "@/src/lib/chart-theme"
import {
  ColormapName,
  colormapPlotlyScale,
  DEFAULT_COLORMAP,
} from "@/src/lib/colormaps"

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
  colormap?: ColormapName
}

export default function HeatmapPlot(props: HeatmapProps) {
  const theme = useChartTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

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
      color: theme.cursor,
      width: 1.5,
    },
  } as Plotly.Shape)

  const refCursorShape3d = useRef<Plotly.PlotData>({
    type: "scatter3d",
    mode: "lines",
    x: [0, 0],
    y: [0, 100],
    z: [0, 0],
    line: {
      color: theme.cursor,
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

  const colormap = props.colormap ?? DEFAULT_COLORMAP
  const colorscaleRef = useRef<{
    name: ColormapName
    scale: Array<[number, string]>
  } | null>(null)
  if (!colorscaleRef.current || colorscaleRef.current.name !== colormap) {
    colorscaleRef.current = { name: colormap, scale: colormapPlotlyScale(colormap) }
  }

  // Set by data updates: the next paint bumps datarevision and re-enables
  // autorange (as every data update always did).
  const dataDirtyRef = useRef(true)

  const applyTheme = (t: ChartTheme) => {
    applyPlotlyTheme(layoutRef.current, t, { scene: true })
    refCursorShape2d.current.line = {
      ...refCursorShape2d.current.line,
      color: t.cursor,
    }
    refCursorShape3d.current.line = {
      ...refCursorShape3d.current.line,
      color: t.cursor,
    }
  }

  useEffect(() => {
    if (plotRef.current) {
      applyTheme(themeRef.current)
      Plotly.newPlot(
        plotRef.current,
        [
          {
            z: plotDataRef.current.z,
            type: plotTypeRef.current,
            // type: "heatmapgl",
            colorscale: colorscaleRef.current!.scale,
            colorbar: plotlyColorbarTheme(themeRef.current),
            y: yLabelsRef.current,
            zmin: zMinRef.current,
            zmax: zMaxRef.current,
          },
        ],
        layoutRef.current
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Single paint path for data, plot type, z range, colormap and theme
  // changes; runs at most once per animation frame with the latest props.
  const painter = useRafPainter(() => {
    if (plotRef.current == null) {
      return
    }

    const plotType = plotTypeRef.current
    const plotData = plotDataRef.current
    const colorscale = colorscaleRef.current!.scale
    const colorbar = plotlyColorbarTheme(themeRef.current)

    if (dataDirtyRef.current) {
      dataDirtyRef.current = false
      layoutRef.current.datarevision += 1
      // layoutRef.current.uirevision = "true"
      layoutRef.current.xaxis.autorange = true
      layoutRef.current.yaxis.autorange = true
    }

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
            colorscale,
            colorbar,
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
            type: plotType,
            colorscale,
            colorbar,
            y: yLabelsRef.current,
            cmin: zMinRef.current,
            cmax: zMaxRef.current,
          } as Partial<Plotly.PlotData>,
          cursorShape3d,
        ],
        layoutRef.current
      )
    }
  }, plotRef)

  useEffect(() => {
    dataDirtyRef.current = true
    painter.schedule()
  }, [props.plotData, painter])

  useEffect(() => {
    painter.schedule()
  }, [props.type, props.zMin, props.zMax, props.yLabels, colormap, painter])

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
