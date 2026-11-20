"use client"

import { memo, useMemo, useRef, useState } from "react"
import {
  Node,
  NodeProps,
} from "@xyflow/react"
import {
  Button,
  Collapse,
  FormControlLabel,
  Paper,
  Switch,
  TextField,
} from "@mui/material"
import { css } from "@emotion/react"

import dynamic from "next/dynamic"
import { enqueueSnackbar } from "notistack"

import { NodeHandleLeft } from "@/src/components/node-handle"
import {
  GraphEndpoint,
  PortDataType,
  PortValue,
} from "nonoha-client-js"
import { useEditorInput } from "@/src/hooks/use-editor-input"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { TimeSeriesPlotData } from "@/src/components/time-series-graph"
import { useThemeStore } from "@/src/stores/theme-store"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { ExpandLess, ExpandMore } from "@mui/icons-material"
import { ScatterPlotData, ScatterPlotLayout } from "@/src/components/scatter-plot"
import { EditorNodeHeader } from "@/src/components/node-header"
const ScatterPlot = dynamic(() => import("@/src/components/scatter-plot"), {
  ssr: false,
})

const PlotWrapper = memo(
  ({
    graphEndpoint,
    recording,
    className,
  }: {
    graphEndpoint: GraphEndpoint
    recording: boolean
    className?: string
  }) => {
    const maxPointCount = 128

    const refRecording = useRef(recording)
    refRecording.current = recording

    // Name of the connected port, for error messages.
    const refSeriesPortName = useRef("")

    const [{ colors }] = useThemeStore()

    const [errorMessage, setErrorMessage] = useState<string | undefined>(
      undefined
    )

    const [plotData, setPlotData] = useState<ScatterPlotData>({
      traces: [],
    })
    const refTraces = useRef<{ x: number[]; y: number[]; z: number[] }[]>([])

    const [layout, setLayout] = useState<ScatterPlotLayout>({
      width: 480,
      height: 320,
      xRange: [-1000, 1000],
      yRange: [-1000, 1000],
      zRange: [-1, 1],
    })

    const opacities = useMemo(() => {
      const array = new Array(maxPointCount)

      // 各インデックスの値を計算
      for (let i = 0; i < maxPointCount; i++) {
        // 0～1の範囲で位置を計算（最初=0, 最後=1）
        const position = i / (maxPointCount - 1)

        // 前半は薄く(0.3)、後半は濃く(1.0)
        array[i] = 0.3 + 0.7 * position
      }

      return array
    }, [maxPointCount])
    const refOpacities = useRef(opacities)
    refOpacities.current = opacities

    // Solid edge ($output port: every value) or dashed edge (engine node:
    // rows since the last inspector sample). Points accumulate into a trail,
    // so the inspector delivers every row rather than the latest one.
    const seriesSource = useEditorInput(graphEndpoint, "series", (values: PortValue[]) => {
        if (!refRecording.current) {
          return
        }

        while (refTraces.current.length < values.length) {
          // refTraces.current.push({
          //   x: new Array(maxPointCount),
          //   y: new Array(maxPointCount),
          // })
          refTraces.current.push({ x: [], y: [], z: [] })
        }
        const traces = refTraces.current

        for (let i = 0; i < values.length; ++i) {
          const value = values[i]
          if (value.shape.length !== 2 && value.shape[1] !== 2) {
            setErrorMessage(
              `Invalid output shape for ${refSeriesPortName.current}: expected 2D array`
            )
            return
          }
          switch (value.dataType) {
            case PortDataType.Float32:
              const x = new Array(value.shape[0])
              const y = new Array(value.shape[0])

              for (let j = 0; j < value.shape[0]; ++j) {
                x[j] = value.array[j * 2 + 0]
                y[j] = value.array[j * 2 + 1]
              }

              // 配列を効率的に結合
              // concatではなくpushを使用（concatは新しい配列を返すだけで元の配列は変更されない）
              traces[i].x.push(...Array.from(x))
              traces[i].y.push(...Array.from(y))
              traces[i].z = new Array(traces[i].x.length).fill(0)

              // 最大ポイント数を超えた場合は古いデータを削除
              if (traces[i].x.length > maxPointCount) {
                // スライス操作を1回のみ行う（効率的）
                const startIdx = traces[i].x.length - maxPointCount
                traces[i].x = traces[i].x.slice(startIdx)
                traces[i].y = traces[i].y.slice(startIdx)
              }

              break
            default:
              setErrorMessage(
                `Unsupported data type for ${refSeriesPortName.current}: ${value.dataType}`
              )
              return
          }
        }

        setPlotData({
          traces: traces.map(trace => ({
            x: trace.x,
            y: trace.y,
            z: trace.z,
            opacities: refOpacities.current,
          })),
        })

        setErrorMessage(undefined)
    })
    refSeriesPortName.current =
      seriesSource.kind === "output"
        ? seriesSource.portName
        : seriesSource.kind === "inspector"
          ? `${seriesSource.ref.node}.${seriesSource.ref.port}`
          : ""

    return (
      <div>
        <ScatterPlot
          className={className}
          layout={layout}
          plotData={plotData}
        />
        <div
          css={{
            color: colors.error,
            fontSize: 12,
            padding: 4,
            userSelect: "text",
            cursor: "text",
          }}
        >
          {errorMessage || ""}
        </div>
      </div>
    )
  }
)

export type ScatterPlotNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint
  editorModelUpdater: EditorModelUpdater
}>

export const ScatterPlotNode = memo((props: NodeProps<ScatterPlotNode>) => {
  const [{ colors }] = useThemeStore()

  const [isRecording, setIsRecording] = useState(false)


  return (
    <Paper
      sx={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        background: colors.surfaceContainerHighest,
        color: colors.onSurface,
        outlineOffset: "4px",
      }}
      style={{
        outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
      }}
    >
      <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />
      <EditorNodeHeader label={props.data.label} />
      <div
        css={css({
          display: "flex",
          flexDirection: "row",
        })}
      >
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
          })}
        >
          <NodeHandleLeft id="series" label="series" />
        </div>
        <div css={css({ flexGrow: 1 })} />
      </div>
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          padding: 8,
        })}
      >
        <FormControlLabel
          control={
            <Switch
              checked={isRecording}
              onChange={event => {
                setIsRecording(event.target.checked)
              }}
            />
          }
          label="REC"
        />
        <PlotWrapper
          graphEndpoint={props.data.graphEndpoint}
          recording={isRecording}
          className={props.selected ? "nowheel" : ""}
        />
      </div>
    </Paper>
  )
})
