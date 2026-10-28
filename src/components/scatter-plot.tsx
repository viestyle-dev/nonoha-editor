import Plotly, { Layout } from "plotly.js-dist-min"
import { useEffect, useRef } from "react"

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

  const refTestInit = useRef(false)

  useEffect(() => {
    if (refPlot.current == null) {
      return
    }

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

      // relayoutイベントリスナーを追加してカメラ状態を保存
      plotlyHTMLElement.on("plotly_relayout", eventData => {
        console.log(eventData)
      })
    })
  }, [])

  useEffect(() => {
    if (refPlotlyHTMLElement.current == null || refPlot.current == null) {
      return
    }

    refLayout.current.datarevision =
      (refLayout.current.datarevision as number) + 1

    // console.log(refLayout.current)
    // refLayout.current.scene.aspectmode = "manual"

    // if (!refTestInit.current) {
    //   // エラー時は全体を再描画
    //   Plotly.react(
    //     refPlot.current,
    //     refPlotData.current.traces.map(trace => ({
    //       x: trace.x,
    //       y: trace.y,
    //       z: trace.z,
    //       type: "scatter3d",
    //       mode: "lines+markers",
    //       marker: {
    //         opacity: trace.opacities,
    //       },
    //     })),
    //     refLayout.current
    //   )
    //   return
    // }

    // refTestInit.current = true
    // // 各トレースを個別に更新
    // refPlotData.current.traces.forEach((trace, i) => {
    //   // 各トレース用の更新オブジェクトを新たに作成
    //   const updateForThisTrace: any = {
    //     x: [trace.x],
    //     y: [trace.y],
    //   }

    //   // zが存在する場合のみ追加
    //   if (trace.z && trace.z.length > 0) {
    //     updateForThisTrace.z = [trace.z]
    //   }

    //   // opacitiesが存在する場合のみ追加
    //   if (trace.opacities && trace.opacities.length > 0) {
    //     updateForThisTrace["marker.opacity"] = [trace.opacities]
    //   }

    //   // このトレースのみを更新
    //   Plotly.restyle(refPlot.current, updateForThisTrace, [i])
    // })

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
  }, [props.plotData])

  return <div ref={refPlot} className={props.className} />
}
