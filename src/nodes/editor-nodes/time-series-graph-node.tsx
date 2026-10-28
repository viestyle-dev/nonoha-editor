"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useHandleConnections,
  useNodesData,
  useReactFlow,
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
const TimeSeriesGraph = dynamic(
  () => import("@/src/components/time-series-graph"),
  {
    ssr: false,
  }
)

const GraphWrapper = memo(
  ({
    graphEndpoint,
    recording,
    xLength,
    revision,
    graphWidth = 480,
    graphHeight = 320,
    yRange,
  }: {
    graphEndpoint: GraphEndpoint | undefined
    recording: boolean
    xLength: number
    revision: number
    graphWidth?: number
    graphHeight?: number
    yRange?: { min?: number; max?: number }
  }) => {
    const refRecording = useRef(recording)
    refRecording.current = recording

    const refXLength = useRef(xLength)
    refXLength.current = xLength

    // ---
    const seriesConns = useHandleConnections({ type: "target", id: "series" })
    const seriesSourcesData = useNodesData<BasicPortNode>(
      seriesConns[0]?.source
    )
    const seriesSourcesDataRef = useRef(seriesSourcesData)
    seriesSourcesDataRef.current = seriesSourcesData
    // ---

    const [{ colors }] = useThemeStore()

    const [errorMessage, setErrorMessage] = useState<string | undefined>(
      undefined
    )

    const currentCursorPosition = useRef(0)
    const refTraces = useRef<number[][]>([])
    // Reusable buffer for seriesList to avoid frequent memory allocation
    const refSeriesList = useRef<(number[] | ArrayLike<number>)[]>([])

    const [plotData, setPlotData] = useState<TimeSeriesPlotData>({
      x: Array.from({ length: xLength }, (_, i) => i),
      traces: refTraces.current,
      cursorPosition: 0,
    })

    useEffect(() => {
      const xLength = refXLength.current
      const newTraces = refTraces.current.map(_ => new Array(xLength).fill(0))
      refTraces.current = newTraces
      currentCursorPosition.current = 0

      setPlotData({
        x: Array.from({ length: xLength }, (_, i) => i),
        traces: newTraces,
        cursorPosition: currentCursorPosition.current,
      })
    }, [xLength])

    const clearPlot = () => {
      const xLength = refXLength.current
      const newTraces = refTraces.current.map(_ => new Array(xLength).fill(0))
      refTraces.current = newTraces
      currentCursorPosition.current = 0

      setPlotData({
        x: Array.from({ length: xLength }, (_, i) => i),
        traces: newTraces,
        cursorPosition: currentCursorPosition.current,
      })
    }

    useEffect(() => {
      clearPlot()
    }, [revision])

    useEffect(() => {
      if (!graphEndpoint) {
        return
      }
      const onOutputCallback = (output: PortData) => {
        if (seriesSourcesDataRef.current?.data.port.name !== output.portName) {
          return
        }
        if (!refRecording.current) {
          return
        }

        // 2D配列データの場合（高速化された処理）
        if (output.values.length === 1 && output.values[0].shape.length === 2) {
          const value = output.values[0]
          const [rows, cols] = value.shape

          // データタイプチェックを先に行う（ループ外で1回のみ）
          switch (value.dataType) {
            case PortDataType.Float32:
            case PortDataType.Float64:
            case PortDataType.Int8:
            case PortDataType.Uint8:
            case PortDataType.Int16:
            case PortDataType.Uint16:
            case PortDataType.Int32:
            case PortDataType.Uint32:
            case PortDataType.Bool:
              break
            default:
              setErrorMessage(
                `Unsupported data type. (type: ${value.dataType})`
              )
              return
          }

          // 案1: refSeriesListを再利用（サイズ変更時のみ再確保）
          if (
            refSeriesList.current.length !== cols ||
            (refSeriesList.current[0] as number[])?.length !== rows
          ) {
            refSeriesList.current = Array.from({ length: cols }, () =>
              new Array(rows)
            )
          }
          const seriesList = refSeriesList.current as number[][]

          // 最適化されたデータコピー（キャッシュ効率とメモリアクセス最適化）
          const sourceArray = value.array
          for (let i = 0; i < rows; i++) {
            const rowOffset = i * cols
            for (let j = 0; j < cols; j++) {
              seriesList[j][i] = sourceArray[rowOffset + j]
            }
          }
        } else {
          // 1D配列データの場合
          const valueCount = output.values.length

          // 案1: refSeriesListを再利用（サイズ変更時のみ再確保）
          if (refSeriesList.current.length !== valueCount) {
            refSeriesList.current = new Array(valueCount)
          }

          for (let i = 0; i < valueCount; i++) {
            const value = output.values[i]

            if (value.shape.length !== 1) {
              setErrorMessage(`Data shape must be 1D. (index: ${i})`)
              return
            }
            switch (value.dataType) {
              case PortDataType.Float32:
              case PortDataType.Float64:
              case PortDataType.Int8:
              case PortDataType.Uint8:
              case PortDataType.Int16:
              case PortDataType.Uint16:
              case PortDataType.Int32:
              case PortDataType.Uint32:
              case PortDataType.Bool:
                // 案2: TypedArrayを直接使用（コピーなし）
                refSeriesList.current[i] = value.array
                break
              default:
                setErrorMessage(
                  `Unsupported data type. (index: ${i}, type: ${value.dataType})`
                )
                return
            }

            // 長さチェックを最適化（必要な場合のみ）
            if (
              i > 0 &&
              refSeriesList.current[i].length !==
                refSeriesList.current[0].length
            ) {
              setErrorMessage(
                `All series must have the same length. (index: ${i})`
              )
              return
            }
          }
        }
        const seriesList = refSeriesList.current

        // 以下の処理も最適化
        const appendCount = seriesList[0].length
        const xLength = refXLength.current
        const nextCursorPosition =
          (currentCursorPosition.current + appendCount) % xLength
        const tailCursorPosition = (nextCursorPosition + xLength - 1) % xLength

        // traces配列の初期化を最適化
        if (seriesList.length !== refTraces.current.length) {
          refTraces.current = Array.from({ length: seriesList.length }, () =>
            new Array(xLength).fill(0)
          )
        }
        const traces = refTraces.current // データコピー処理を最適化（バッチ処理とキャッシュ効率化）
        if (nextCursorPosition >= appendCount) {
          // 単純なケース：バッファの境界をまたがない
          const startPos = nextCursorPosition - appendCount
          // ループを最適化：外側をシリーズ、内側をデータポイントに
          for (let j = 0; j < seriesList.length; j++) {
            const tracesJ = traces[j]
            const seriesListJ = seriesList[j]
            for (let i = 0; i < appendCount; i++) {
              tracesJ[startPos + i] = seriesListJ[i]
            }
          }
        } else {
          // 複雑なケース：バッファの境界をまたぐ
          const remainingInNextCursor = nextCursorPosition
          const remainingInBuffer = appendCount - nextCursorPosition

          // 前半部分を最適化
          for (let j = 0; j < seriesList.length; j++) {
            const tracesJ = traces[j]
            const seriesListJ = seriesList[j]
            for (let i = 0; i < remainingInNextCursor; i++) {
              tracesJ[i] = seriesListJ[remainingInBuffer + i]
            }
          }

          // 後半部分を最適化
          const start = Math.max(
            nextCursorPosition,
            xLength - remainingInBuffer
          )
          for (let j = 0; j < seriesList.length; j++) {
            const tracesJ = traces[j]
            const seriesListJ = seriesList[j]
            for (let i = start; i < xLength; i++) {
              tracesJ[i] = seriesListJ[i - start]
            }
          }
        }

        currentCursorPosition.current = nextCursorPosition
        setErrorMessage(undefined)

        setPlotData(prev => ({
          x: prev.x,
          traces: traces,
          cursorPosition: tailCursorPosition,
        }))
      }

      graphEndpoint.addOutputCallback(onOutputCallback)

      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint])

    return (
      <div>
        <TimeSeriesGraph
          style={{ width: graphWidth, height: graphHeight }}
          graphWidth={graphWidth}
          graphHeight={graphHeight}
          plotData={plotData}
          yRange={yRange}
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

export type TimeSeriesGraphNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    xLength?: number
    graphWidth?: number
    graphHeight?: number
    yMin?: number
    yMax?: number
  }
}>

export const TimeSeriesGraphNode = memo(
  (props: NodeProps<TimeSeriesGraphNode>) => {
    const { setNodes } = useReactFlow()
    const [{ colors }] = useThemeStore()

    const xLength = props.data.nodeData?.xLength ?? 1500
    const graphWidth = props.data.nodeData?.graphWidth ?? 480
    const graphHeight = props.data.nodeData?.graphHeight ?? 320

    // Y軸範囲: undefined = autorange
    const [yMin, setYMin] = useState(props.data.nodeData?.yMin ?? undefined)
    const [yMax, setYMax] = useState(props.data.nodeData?.yMax ?? undefined)

    const [xLengthInput, setXLengthInput] = useState(xLength.toString())
    const [graphWidthInput, setGraphWidthInput] = useState(
      graphWidth.toString()
    )
    const [graphHeightInput, setGraphHeightInput] = useState(
      graphHeight.toString()
    )
    // 空文字列 = undefined = autorange
    const [yMinInput, setYMinInput] = useState(props.data.nodeData?.yMin?.toString() ?? "")
    const [yMaxInput, setYMaxInput] = useState(props.data.nodeData?.yMax?.toString() ?? "")

    const updateNodeData = useCallback(
      (newNodeData: Partial<NonNullable<TimeSeriesGraphNode["data"]["nodeData"]>>) => {
        setNodes(nodes =>
          nodes.map(node =>
            node.id === props.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    nodeData: { ...(node.data as TimeSeriesGraphNode["data"]).nodeData, ...newNodeData },
                  },
                }
              : node
          )
        )
      },
      [props.id, setNodes]
    )

    const [isRecording, setIsRecording] = useState(false)

    const [graphRevision, setGraphRevision] = useState(0)

    const [detailsOpen, setDetailsOpen] = useState(false)

    const editorModelUpdater = props.data.editorModelUpdater

    // Sync input fields when props.data.nodeData changes (e.g., from copy/paste or external updates)
    useEffect(() => {
      if (props.data.nodeData?.xLength !== undefined) {
        setXLengthInput(props.data.nodeData.xLength.toString())
      }
      if (props.data.nodeData?.graphWidth !== undefined) {
        setGraphWidthInput(props.data.nodeData.graphWidth.toString())
      }
      if (props.data.nodeData?.graphHeight !== undefined) {
        setGraphHeightInput(props.data.nodeData.graphHeight.toString())
      }
      if (props.data.nodeData?.yMin != null) {
        setYMinInput(props.data.nodeData.yMin.toString())
        setYMin(props.data.nodeData.yMin)
      } else {
        setYMinInput("")
        setYMin(undefined)
      }
      if (props.data.nodeData?.yMax != null) {
        setYMaxInput(props.data.nodeData.yMax.toString())
        setYMax(props.data.nodeData.yMax)
      } else {
        setYMaxInput("")
        setYMax(undefined)
      }
    }, [
      props.data.nodeData?.xLength,
      props.data.nodeData?.graphWidth,
      props.data.nodeData?.graphHeight,
      props.data.nodeData?.yMin,
      props.data.nodeData?.yMax,
    ])

    // 統合されたapplySettings関数
    const applySettings = useCallback(async () => {
      const xLen = Number(xLengthInput)
      const width = Number(graphWidthInput)
      const height = Number(graphHeightInput)
      const yMinVal = yMinInput ? Number(yMinInput) : undefined
      const yMaxVal = yMaxInput ? Number(yMaxInput) : undefined

      // バリデーション
      if (isNaN(xLen) || xLen <= 0) {
        enqueueSnackbar("Invalid X Length", { variant: "error" })
        return
      }
      if (xLen > 12000) {
        enqueueSnackbar("X Length too large (max: 12000)", { variant: "error" })
        return
      }
      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        enqueueSnackbar("Invalid graph size", { variant: "error" })
        return
      }
      if (yMinVal !== undefined && yMaxVal !== undefined && yMinVal >= yMaxVal) {
        enqueueSnackbar("Y Min must be less than Y Max", { variant: "error" })
        return
      }

      const updates: Partial<NonNullable<TimeSeriesGraphNode["data"]["nodeData"]>> = {
        xLength: xLen,
        graphWidth: width,
        graphHeight: height,
        yMin: yMinVal,
        yMax: yMaxVal,
      }

      updateNodeData(updates)
      editorModelUpdater.patchNodeData(props.id, {
        xLength: xLen,
        graphWidth: width,
        graphHeight: height,
        yMin: yMinVal,
        yMax: yMaxVal,
      })
      setYMin(yMinVal)
      setYMax(yMaxVal)
    }, [xLengthInput, graphWidthInput, graphHeightInput, yMinInput, yMaxInput, updateNodeData, editorModelUpdater, props.id])

    // yRangeをメモ化（部分autorange対応: 片方のみ設定も可能）
    const yRange = useMemo(() => {
      if (yMin === undefined && yMax === undefined) {
        return undefined
      }
      return { min: yMin, max: yMax }
    }, [yMin, yMax])

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
          css={css`
            display: flex;
            flex-direction: row;
          `}
        >
          <div
            css={css`
              display: flex;
              flex-direction: column;
            `}
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
          <div
            css={css({
              display: "flex",
              flexDirection: "row",
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
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setGraphRevision(graphRevision + 1)
              }}
            >
              Clear
            </Button>
          </div>
          <GraphWrapper
            graphEndpoint={props.data.graphEndpoint}
            recording={isRecording}
            xLength={xLength}
            revision={graphRevision}
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            yRange={yRange}
          />
          <Button
            css={css({
              height: 16,
              color: colors.onSurfaceVariant,
            })}
            size="small"
            onClick={() => {
              setDetailsOpen(!detailsOpen)
            }}
          >
            {detailsOpen ? <ExpandLess /> : <ExpandMore />}
          </Button>
          <Collapse in={detailsOpen}>
            <div
              css={css({
                display: "flex",
                flexDirection: "column",
                flexGrow: 1,
                padding: 8,
                gap: 8,
              })}
            >
              {/* X Length */}
              <TextField
                label="X Length"
                size="small"
                value={xLengthInput}
                onChange={event => {
                  setXLengthInput(event.target.value)
                }}
                fullWidth
              />

              <Divider />

              {/* グラフサイズ */}
              <div
                css={css({
                  display: "flex",
                  flexDirection: "row",
                  gap: 8,
                })}
              >
                <TextField
                  label="Width"
                  size="small"
                  value={graphWidthInput}
                  onChange={event => {
                    setGraphWidthInput(event.target.value)
                  }}
                  css={css({
                    flexGrow: 1,
                  })}
                />
                <TextField
                  label="Height"
                  size="small"
                  value={graphHeightInput}
                  onChange={event => {
                    setGraphHeightInput(event.target.value)
                  }}
                  css={css({
                    flexGrow: 1,
                  })}
                />
              </div>

              <Divider />

              {/* Y軸範囲 - 空=autorange */}
              <div
                css={css({
                  display: "flex",
                  flexDirection: "row",
                  gap: 8,
                })}
              >
                <TextField
                  label="Y Min"
                  size="small"
                  value={yMinInput}
                  onChange={event => {
                    setYMinInput(event.target.value)
                  }}
                  placeholder="auto"
                  css={css({
                    flexGrow: 1,
                  })}
                />
                <TextField
                  label="Y Max"
                  size="small"
                  value={yMaxInput}
                  onChange={event => {
                    setYMaxInput(event.target.value)
                  }}
                  placeholder="auto"
                  css={css({
                    flexGrow: 1,
                  })}
                />
              </div>

              {/* 単一のApplyボタン */}
              <Button
                variant="text"
                size="small"
                onClick={applySettings}
              >
                Apply Settings
              </Button>
            </div>
          </Collapse>
        </div>
      </Paper>
    )
  }
)
