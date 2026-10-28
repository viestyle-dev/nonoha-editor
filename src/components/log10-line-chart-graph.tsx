import Plotly, { TypedArray } from "plotly.js-dist-min"
import { CSSProperties, useEffect, useRef } from "react"

// Log10軸のデフォルト目盛り値を取得してカスタムテキストを生成
function generateLogTickSettings(min: number, max: number) {
  // Plotlyのデフォルト間隔に従った目盛り値を生成
  const tickVals: number[] = []
  const tickTexts: string[] = []

  const logMin = Math.floor(Math.log10(min))
  const logMax = Math.ceil(Math.log10(max))

  for (let exp = logMin; exp <= logMax; exp++) {
    const baseValue = Math.pow(10, exp)
    if (baseValue >= min && baseValue <= max) {
      tickVals.push(baseValue)
      // 10^n ぴったりの場合
      if (exp === 0) {
        tickTexts.push("1")
      } else if (exp === 1) {
        tickTexts.push("10")
      } else {
        tickTexts.push(`10<sup>${exp}</sup>`)
      }
    }

    // 10^n * 2, 5 の中間値も追加（Plotlyのデフォルト挙動に合わせる）
    for (const mult of [2, 5]) {
      const value = baseValue * mult
      if (value >= min && value <= max && value < Math.pow(10, exp + 1)) {
        tickVals.push(value)
        if (exp === 0) {
          tickTexts.push(mult.toString())
        } else {
          tickTexts.push(`${mult}×10<sup>${exp}</sup>`)
        }
      }
    }
  }

  // 値順にソート
  const combined = tickVals.map((val, i) => ({ val, text: tickTexts[i] }))
  combined.sort((a, b) => a.val - b.val)

  return {
    tickvals: combined.map(item => item.val),
    ticktext: combined.map(item => item.text)
  }
}

// 10^nぴったりの値のみを取得
function getPowerOf10Values(min: number, max: number): number[] {
  const values: number[] = []
  const logMin = Math.floor(Math.log10(min))
  const logMax = Math.ceil(Math.log10(max))

  for (let exp = logMin; exp <= logMax; exp++) {
    const value = Math.pow(10, exp)
    if (value >= min && value <= max) {
      values.push(value)
    }
  }

  return values
}

// Log10軸用の黒実線shapesを生成
function generatePowerOf10GridLines(
  axisType: 'x' | 'y',
  min: number,
  max: number,
  otherAxisMin?: number,
  otherAxisMax?: number
) {
  const powerOf10Values = getPowerOf10Values(min, max)
  const shapes: Record<string, unknown>[] = []

  powerOf10Values.forEach(value => {
    if (axisType === 'x') {
      // 縦線（X軸の値に対する）
      shapes.push({
        type: 'line',
        x0: value,
        x1: value,
        y0: otherAxisMin !== undefined ? otherAxisMin : 0,
        y1: otherAxisMax !== undefined ? otherAxisMax : 1,
        yref: otherAxisMin !== undefined && otherAxisMax !== undefined ? 'y' : 'paper',
        line: {
          color: 'black',
          width: 1
        }
      })
    } else {
      // 横線（Y軸の値に対する）
      shapes.push({
        type: 'line',
        y0: value,
        y1: value,
        x0: otherAxisMin !== undefined ? otherAxisMin : 0,
        x1: otherAxisMax !== undefined ? otherAxisMax : 1,
        xref: otherAxisMin !== undefined && otherAxisMax !== undefined ? 'x' : 'paper',
        line: {
          color: 'black',
          width: 1
        }
      })
    }
  })

  return shapes
}

export interface Log10LineChartPlotData {
  x: number[] | Float32Array | undefined
  traces: (number[] | TypedArray)[]
}

export interface Log10LineChartGraphProps {
  style?: CSSProperties
  plotData: Log10LineChartPlotData
  graphWidth: number
  graphHeight: number
  xLogScale?: boolean
  yLogScale?: boolean
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
}

export default function Log10LineChartGraph(props: Log10LineChartGraphProps) {
  const refPlot = useRef<HTMLDivElement>(null)
  const refLayout = useRef({
    width: props.graphWidth,
    height: props.graphHeight,
    margin: { l: 40, r: 40, t: 40, b: 40 },
    uirevision: "true",
    xaxis: {
      type: (props.xLogScale ? 'log' : 'linear') as 'log' | 'linear',
      autorange: props.xMin === undefined || props.xMax === undefined,
      range: (props.xMin !== undefined && props.xMax !== undefined)
        ? (props.xLogScale ? [Math.log10(props.xMin), Math.log10(props.xMax)] : [props.xMin, props.xMax])
        : undefined,
      // Log軸の場合のみカスタム設定、Linear軸は完全デフォルト
      ...(props.xLogScale && props.xMin !== undefined && props.xMax !== undefined ?
        (() => {
          const tickSettings = generateLogTickSettings(props.xMin!, props.xMax!)
          return {
            tickmode: 'array' as const,
            tickvals: tickSettings.tickvals,
            ticktext: tickSettings.ticktext
          }
        })() : {})
    },
    yaxis: {
      type: (props.yLogScale ? 'log' : 'linear') as 'log' | 'linear',
      autorange: props.yMin === undefined || props.yMax === undefined,
      range: (props.yMin !== undefined && props.yMax !== undefined)
        ? (props.yLogScale ? [Math.log10(props.yMin), Math.log10(props.yMax)] : [props.yMin, props.yMax])
        : undefined,
      // Log軸の場合のみカスタム設定、Linear軸は完全デフォルト
      ...(props.yLogScale && props.yMin !== undefined && props.yMax !== undefined ?
        (() => {
          const tickSettings = generateLogTickSettings(props.yMin!, props.yMax!)
          return {
            tickmode: 'array' as const,
            tickvals: tickSettings.tickvals,
            ticktext: tickSettings.ticktext
          }
        })() : {})
    },
    datarevision: 0,
    // 10^nぴったりの値での黒実線を追加
    shapes: (() => {
      const shapes: Record<string, unknown>[] = []

      // X軸のLog10で範囲指定がある場合
      if (props.xLogScale && props.xMin !== undefined && props.xMax !== undefined) {
        const yMin = props.yLogScale && props.yMin !== undefined ? props.yMin : undefined
        const yMax = props.yLogScale && props.yMax !== undefined ? props.yMax : undefined
        shapes.push(...generatePowerOf10GridLines('x', props.xMin, props.xMax, yMin, yMax))
      }

      // Y軸のLog10で範囲指定がある場合
      if (props.yLogScale && props.yMin !== undefined && props.yMax !== undefined) {
        const xMin = props.xLogScale && props.xMin !== undefined ? props.xMin : undefined
        const xMax = props.xLogScale && props.xMax !== undefined ? props.xMax : undefined
        shapes.push(...generatePowerOf10GridLines('y', props.yMin, props.yMax, xMin, xMax))
      }

      return shapes
    })()
  })
  const plotDataRef = useRef<Log10LineChartPlotData>(props.plotData)
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

    // Update axis types and ranges
    refLayout.current.xaxis.type = (props.xLogScale ? 'log' : 'linear') as 'log' | 'linear'
    refLayout.current.yaxis.type = (props.yLogScale ? 'log' : 'linear') as 'log' | 'linear'

    // Update X axis ranges
    if (props.xMin !== undefined && props.xMax !== undefined) {
      refLayout.current.xaxis.autorange = false
      refLayout.current.xaxis.range = props.xLogScale
        ? [Math.log10(props.xMin), Math.log10(props.xMax)]
        : [props.xMin, props.xMax]
    } else {
      refLayout.current.xaxis.autorange = true
      refLayout.current.xaxis.range = undefined
    }

    // Update Y axis ranges with autorangeoptions support
    const yaxis = refLayout.current.yaxis as Record<string, unknown>
    if (props.yMin !== undefined && props.yMax !== undefined) {
      refLayout.current.yaxis.autorange = false
      refLayout.current.yaxis.range = props.yLogScale
        ? [Math.log10(props.yMin), Math.log10(props.yMax)]
        : [props.yMin, props.yMax]
      delete yaxis.autorangeoptions
    } else if (props.yMin !== undefined) {
      refLayout.current.yaxis.autorange = true
      yaxis.autorangeoptions = { minallowed: props.yMin }
      refLayout.current.yaxis.range = undefined
    } else if (props.yMax !== undefined) {
      refLayout.current.yaxis.autorange = true
      yaxis.autorangeoptions = { maxallowed: props.yMax }
      refLayout.current.yaxis.range = undefined
    } else {
      refLayout.current.yaxis.autorange = true
      refLayout.current.yaxis.range = undefined
      delete yaxis.autorangeoptions
    }

    // X軸の設定
    const xaxis = refLayout.current.xaxis as Record<string, unknown>
    if (props.xLogScale && props.xMin !== undefined && props.xMax !== undefined) {
      // Log軸: カスタム目盛りラベル
      const tickSettings = generateLogTickSettings(props.xMin, props.xMax)
      xaxis.tickmode = 'array'
      xaxis.tickvals = tickSettings.tickvals
      xaxis.ticktext = tickSettings.ticktext
    } else if (props.xLogScale) {
      // Log軸だが範囲未設定: デフォルト
      xaxis.tickmode = 'auto'
      delete xaxis.tickvals
      delete xaxis.ticktext
    } else {
      // Linear軸: 完全デフォルト設定
      delete xaxis.tickmode
      delete xaxis.tickvals
      delete xaxis.ticktext
    }

    // Y軸の設定 (yaxis は上で既に定義済み)
    if (props.yLogScale && props.yMin !== undefined && props.yMax !== undefined) {
      // Log軸: カスタム目盛りラベル
      const tickSettings = generateLogTickSettings(props.yMin, props.yMax)
      yaxis.tickmode = 'array'
      yaxis.tickvals = tickSettings.tickvals
      yaxis.ticktext = tickSettings.ticktext
    } else if (props.yLogScale) {
      // Log軸だが範囲未設定: デフォルト
      yaxis.tickmode = 'auto'
      delete yaxis.tickvals
      delete yaxis.ticktext
    } else {
      // Linear軸: 完全デフォルト設定
      delete yaxis.tickmode
      delete yaxis.tickvals
      delete yaxis.ticktext
    }

    // Shapes（10^nの黒実線）を更新
    const shapes: Record<string, unknown>[] = []

    // X軸のLog10で範囲指定がある場合
    if (props.xLogScale && props.xMin !== undefined && props.xMax !== undefined) {
      const yMin = props.yLogScale && props.yMin !== undefined ? props.yMin : undefined
      const yMax = props.yLogScale && props.yMax !== undefined ? props.yMax : undefined
      shapes.push(...generatePowerOf10GridLines('x', props.xMin, props.xMax, yMin, yMax))
    }

    // Y軸のLog10で範囲指定がある場合
    if (props.yLogScale && props.yMin !== undefined && props.yMax !== undefined) {
      const xMin = props.xLogScale && props.xMin !== undefined ? props.xMin : undefined
      const xMax = props.xLogScale && props.xMax !== undefined ? props.xMax : undefined
      shapes.push(...generatePowerOf10GridLines('y', props.yMin, props.yMax, xMin, xMax))
    }

    // shapesをlayoutに設定
    const layout = refLayout.current as Record<string, unknown>
    layout.shapes = shapes

    Plotly.relayout(refPlot.current, refLayout.current)
  }, [props.xLogScale, props.yLogScale, props.xMin, props.xMax, props.yMin, props.yMax])

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