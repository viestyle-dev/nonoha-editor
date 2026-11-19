import Plotly, { Layout } from "plotly.js-dist-min"
import { useEffect, useRef } from "react"

import { useChartTheme } from "@/src/hooks/use-chart-theme"
import { useRafPainter } from "@/src/hooks/use-raf-painter"
import { applyPlotlyTheme } from "@/src/lib/chart-theme"

export interface ScatterPlotData {
  traces: {
    x: number[]
    y: number[]
    z: number[]
    opacities: number[]
  }[]
}

export interface ScatterPlotLayout {
  width: number
  height: number
  xRange: [number, number]
  yRange: [number, number]
  zRange: [number, number]
}

export interface ScatterPlotProps {
  plotData: ScatterPlotData
  layout: ScatterPlotLayout
  className?: string
}

export default function ScatterPlot(props: ScatterPlotProps) {
  const theme = useChartTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  const refPlot = useRef<HTMLDivElement>(null)
  const refLayout = useRef({
    width: props.layout.width,
    height: props.layout.height,
    margin: { l: 24, r: 24, t: 24, b: 24 },
    datarevision: 0,
    uirevision: "true",
    scene: {
      aspectmode: "manual",
      aspectratio: {
        x: props.layout.xRange[1] - props.layout.xRange[0],
        y: props.layout.yRange[1] - props.layout.yRange[0],
        z: props.layout.zRange[1] - props.layout.zRange[0],
      },
      camera: {
        eye: { x: 0, y: 0, z: 1.5 }, // z軸上（上）から見下ろす
        up: { x: 0, y: 1, z: 0 }, // y軸が上になるように
        center: { x: 0, y: 0, z: 0 },
        projection: {
          type: "orthographic",
        },
      },
      uirevision: "true",
      xaxis: {
        range: props.layout.xRange,
        autorange: false,
      },
      yaxis: {
        range: props.layout.yRange,
        autorange: false,
      },
      zaxis: {
        range: props.layout.zRange,
        autorange: false,
      },
    },
  } as Partial<Layout>)
  const refPlotlyHTMLElement = useRef<Plotly.PlotlyHTMLElement | null>(null)
  const refPlotData = useRef(props.plotData)
  refPlotData.current = props.plotData

  useEffect(() => {
    if (refPlot.current == null) {
      return
    }

    applyPlotlyTheme(refLayout.current, themeRef.current, {
      cartesian: false,
      scene: true,
    })
    Plotly.newPlot(
      refPlot.current,
      refPlotData.current.traces.map(trace => {
        return {
          x: trace.x,
          y: trace.y,
          type: "scatter3d",
          mode: "lines+markers",
          marker: {
            opacity: trace.opacities,
          },
        }
      }),
      refLayout.current
    ).then(plotlyHTMLElement => {
      refPlotlyHTMLElement.current = plotlyHTMLElement
      // Data that arrived before the plot was ready.
      painter.schedule()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Draws the latest plotData; at most once per animation frame.
  const painter = useRafPainter(() => {
    if (refPlotlyHTMLElement.current == null || refPlot.current == null) {
      return
    }

    refLayout.current.datarevision =
      (refLayout.current.datarevision as number) + 1

    Plotly.react(
      refPlot.current,
      refPlotData.current.traces.map(trace => {
        return {
          x: trace.x,
          y: trace.y,
          z: trace.z,
          type: "scatter3d",
          mode: "lines",
          // marker: {
          //   opacity: trace.opacities,
          // },
          line: {
            color: trace.opacities,
          },
        }
      }),
      refLayout.current
    )
  }, refPlot)

  useEffect(() => {
    painter.schedule()
  }, [props.plotData, painter])

  const isFirstThemeRef = useRef(true)
  useEffect(() => {
    if (isFirstThemeRef.current) {
      isFirstThemeRef.current = false
      return
    }
    applyPlotlyTheme(refLayout.current, theme, { cartesian: false, scene: true })
    painter.schedule()
  }, [theme, painter])

  return <div ref={refPlot} className={props.className} />
}
