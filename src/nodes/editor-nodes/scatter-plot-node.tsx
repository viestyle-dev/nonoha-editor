"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useHandleConnections,
  useNodesData,
} from "@xyflow/react"
import {
  Button,
  Collapse,
  Divider,
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
  PortData,
  PortDataType,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { TimeSeriesPlotData } from "@/src/components/time-series-graph"
import { useThemeStore } from "@/src/stores/theme-store"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { ExpandLess, ExpandMore } from "@mui/icons-material"
import { ScatterPlotData, ScatterPlotLayout } from "@/src/components/scatter-plot"
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

    // ---
    const seriesConns = useHandleConnections({ type: "target", id: "series" })
    const seriesSourcesData = useNodesData<BasicPortNode>(
      seriesConns[0]?.source
    )
    const refSeriesSourcesData = useRef(seriesSourcesData)
    refSeriesSourcesData.current = seriesSourcesData
    // ---

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

    useEffect(() => {
      const onOutputCallback = (output: PortData) => {
        if (!refRecording.current) {
          return
        }

        if (refSeriesSourcesData.current?.data.port.name !== output.portName) {
          return
        }

        while (refTraces.current.length < output.values.length) {
          // refTraces.current.push({
          //   x: new Array(maxPointCount),
          //   y: new Array(maxPointCount),
          // })
          refTraces.current.push({ x: [], y: [], z: [] })
        }
        const traces = refTraces.current

        for (let i = 0; i < output.values.length; ++i) {
          const value = output.values[i]
          if (value.shape.length !== 2 && value.shape[1] !== 2) {
            setErrorMessage(
              `Invalid output shape for ${output.portName}: expected 2D array`
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
                `Unsupported data type for ${output.portName}: ${value.dataType}`
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
      }

      graphEndpoint.addOutputCallback(onOutputCallback)
      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint])

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

  const [titleEditing, setTitleEditing] = useState(false)

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
      <div
        className={titleEditing ? "" : "drag-handle"}
        css={css({
          width: "100%",
          padding: 8,
        })}
      >
        <EditableTypography
          editing={titleEditing}
          onEditingChange={editing => {
            setTitleEditing(editing)
          }}
          text={props.data.label}
          fontSize={14}
        />
      </div>
      <Divider />
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
