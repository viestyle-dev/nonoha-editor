"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useHandleConnections,
  useNodesData,
  useReactFlow,
  useViewport,
} from "@xyflow/react"
import {
  alpha,
  Button,
  Divider,
  IconButton,
  Paper,
  TextField,
  Tooltip,
} from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import { css } from "@emotion/react"

import dynamic from "next/dynamic"
import { enqueueSnackbar } from "notistack"

import { NodeHandleLeft } from "@/src/components/node-handle"
import { GraphEndpoint, PortData, PortDataType } from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import {
  FastTimeSeriesPlotData,
  FastTimeSeriesGraphHandle,
  NumericArray,
} from "@/src/components/fast-time-series-graph"
import { useThemeStore } from "@/src/stores/theme-store"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { useControlGates } from "@/src/hooks/use-control-gates"
import { ChartControlBar } from "@/src/components/chart-control-bar"
import { ControlGateHandles } from "@/src/components/control-gate-handles"
import { ControlModeToggle } from "@/src/components/control-mode-toggle"

const FastTimeSeriesGraph = dynamic(
  () => import("@/src/components/fast-time-series-graph"),
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
    graphRef,
    viewportZoom = 1,
    onError,
  }: {
    graphEndpoint: GraphEndpoint | undefined
    recording: boolean
    xLength: number
    revision: number
    graphWidth?: number
    graphHeight?: number
    yRange?: { min?: number; max?: number }
    graphRef: React.RefObject<FastTimeSeriesGraphHandle>
    viewportZoom?: number
    onError?: (error: string | undefined) => void
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

    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    const lastErrorRef = useRef<string | undefined>(undefined)

    const reportError = useCallback((error: string | undefined) => {
      if (error !== lastErrorRef.current) {
        lastErrorRef.current = error
        onErrorRef.current?.(error)
      }
    }, [])

    const currentCursorPosition = useRef(0)
    const refTraces = useRef<number[][]>([])
    // Reusable buffer for seriesList to avoid frequent memory allocation
    const refSeriesList = useRef<NumericArray[]>([])

    const [plotData, setPlotData] = useState<FastTimeSeriesPlotData>({
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
              reportError(
                `Unsupported data type. (type: ${value.dataType})`
              )
              return
          }

          // 案1: refSeriesListを再利用（サイズ変更時のみ再確保）
          if (
            refSeriesList.current.length !== cols ||
            refSeriesList.current[0]?.length !== rows
          ) {
            refSeriesList.current = Array.from({ length: cols }, () =>
              new Array(rows)
            )
          }
          const seriesList = refSeriesList.current

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
              reportError(`Data shape must be 1D. (index: ${i})`)
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
                // uPlotはTypedArrayを受け入れるので変換不要
                refSeriesList.current[i] = value.array
                break
              default:
                reportError(
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
              reportError(
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
        const traces = refTraces.current
        // データコピー処理を最適化（バッチ処理とキャッシュ効率化）
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
        reportError(undefined)

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
      <FastTimeSeriesGraph
        ref={graphRef}
        graphWidth={graphWidth}
        graphHeight={graphHeight}
        plotData={plotData}
        yRange={yRange}
        viewportZoom={viewportZoom}
      />
    )
  }
)

GraphWrapper.displayName = "GraphWrapper"

export type FastTimeSeriesGraphNode = Node<{
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

export const FastTimeSeriesGraphNode = memo(
  (props: NodeProps<FastTimeSeriesGraphNode>) => {
    const { setNodes } = useReactFlow()
    const { zoom: viewportZoom } = useViewport()
    const [{ colors }] = useThemeStore()

    const graphRef = useRef<FastTimeSeriesGraphHandle>(null)

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
      (newNodeData: Partial<NonNullable<FastTimeSeriesGraphNode["data"]["nodeData"]>>) => {
        setNodes(nodes =>
          nodes.map(node =>
            node.id === props.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    nodeData: { ...(node.data as FastTimeSeriesGraphNode["data"]).nodeData, ...newNodeData },
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

    // Flow-driven control: active only while the rec/clear handles are
    // connected (manual operation as before when unconnected).
    const { recConnected, clearConnected, gateError, mode, setMode, recSignal } =
      useControlGates({
        graphEndpoint: props.data.graphEndpoint,
        onRecChange: setIsRecording,
        onClear: () => setGraphRevision(prev => prev + 1),
      })

    const [detailsOpen, setDetailsOpen] = useState(false)
    const [graphError, setGraphError] = useState<string | undefined>()

    // Data errors from the plot pipeline and control-gate wiring errors share
    // the node's error indicator.
    const displayError =
      [graphError, gateError].filter(Boolean).join("\n") || undefined

    const editorModelUpdater = props.data.editorModelUpdater

    // Sync input fields when props.data changes (e.g., from copy/paste or external updates)
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
      if (xLen > 48000) {
        enqueueSnackbar("X Length too large (max: 48000)", { variant: "error" })
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

      const updates: Partial<NonNullable<FastTimeSeriesGraphNode["data"]["nodeData"]>> = {
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
        css={css({
          display: "flex",
          flexDirection: "column",
          overflow: "visible",
          position: "relative",
          background: colors.surfaceContainerHighest,
          color: colors.onSurface,
          outlineOffset: "4px",
        })}
        style={{
          outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
        }}
      >
        <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />
        <div
          className={titleEditing ? "" : "drag-handle"}
          css={css({ width: "100%", padding: 8 })}
        >
          <EditableTypography
            editing={titleEditing}
            onEditingChange={editing => setTitleEditing(editing)}
            text={props.data.label}
            fontSize={14}
          />
        </div>
        <Divider />
        <div css={css({ display: "flex", flexDirection: "row", overflow: "hidden" })}>
          <div css={css({ display: "flex", flexDirection: "column" })}>
            <NodeHandleLeft id="series" label="series" />
            <ControlGateHandles withClear />
          </div>
          <div css={css({ flexGrow: 1 })} />
          {(recConnected || clearConnected) && (
            <div css={css({ display: "flex", alignItems: "center", padding: "0 8px" })}>
              <ControlModeToggle
                mode={mode}
                onModeChange={setMode}
                recSignal={recSignal}
              />
            </div>
          )}
        </div>
        <div css={css({ display: "flex", flexDirection: "column", padding: 8 })}>
          <ChartControlBar
            recording={isRecording}
            onRecordingChange={setIsRecording}
            onClear={() => setGraphRevision(prev => prev + 1)}
            mode={mode}
            recConnected={recConnected}
            clearConnected={clearConnected}
          />
          <GraphWrapper
            graphEndpoint={props.data.graphEndpoint}
            recording={isRecording}
            xLength={xLength}
            revision={graphRevision}
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            yRange={yRange}
            graphRef={graphRef}
            viewportZoom={viewportZoom}
            onError={setGraphError}
          />
        </div>
        {/* Bottom bar with error indicator and settings toggle */}
        <Divider />
        <div
          css={css({
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 4,
            padding: "0 4px",
            minHeight: 24,
            flexShrink: 0,
          })}
        >
          {displayError && (
            <Tooltip
              title={<span style={{ whiteSpace: "pre-line" }}>{displayError}</span>}
              arrow
            >
              <ErrorOutlineIcon css={css({ fontSize: 14, color: colors.error })} />
            </Tooltip>
          )}
          <IconButton
            size="small"
            onClick={() => setDetailsOpen(!detailsOpen)}
            css={css({
              color: detailsOpen ? colors.primary : colors.onSurfaceVariant,
              fontSize: 14,
            })}
          >
            <SettingsIcon fontSize="inherit" />
          </IconButton>
        </div>
        {/* Floating settings panel */}
        {detailsOpen && (
          <div
            css={css({
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 10,
              background: colors.surfaceContainer,
              borderRadius: 4,
              boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)",
              padding: 8,
              border: `1px solid ${colors.outlineVariant}`,
            })}
          >
            {displayError && (
              <div
                css={css({
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 4,
                  padding: "4px 8px",
                  marginBottom: 8,
                  fontSize: 12,
                  color: colors.error,
                  background: alpha(colors.error, 0.08),
                  borderRadius: 4,
                  border: `1px solid ${alpha(colors.error, 0.2)}`,
                })}
              >
                <ErrorOutlineIcon css={css({ fontSize: 14, flexShrink: 0, marginTop: 1 })} />
                <span css={css({ whiteSpace: "pre-wrap", wordBreak: "break-word" })}>
                  {displayError}
                </span>
              </div>
            )}
            <div css={css({ display: "flex", flexDirection: "column", gap: 8 })}>
              <TextField
                label="X Length"
                size="small"
                value={xLengthInput}
                onChange={event => setXLengthInput(event.target.value)}
                fullWidth
              />
              <Divider />
              <div css={css({ display: "flex", flexDirection: "row", gap: 8 })}>
                <TextField
                  label="Width"
                  size="small"
                  value={graphWidthInput}
                  onChange={event => setGraphWidthInput(event.target.value)}
                  css={css({ flexGrow: 1 })}
                />
                <TextField
                  label="Height"
                  size="small"
                  value={graphHeightInput}
                  onChange={event => setGraphHeightInput(event.target.value)}
                  css={css({ flexGrow: 1 })}
                />
              </div>
              <Divider />
              <div css={css({ display: "flex", flexDirection: "row", gap: 8 })}>
                <TextField
                  label="Y Min"
                  size="small"
                  value={yMinInput}
                  onChange={event => setYMinInput(event.target.value)}
                  placeholder="auto"
                  css={css({ flexGrow: 1 })}
                />
                <TextField
                  label="Y Max"
                  size="small"
                  value={yMaxInput}
                  onChange={event => setYMaxInput(event.target.value)}
                  placeholder="auto"
                  css={css({ flexGrow: 1 })}
                />
              </div>
              <Button variant="text" size="small" onClick={applySettings}>
                Apply Settings
              </Button>
            </div>
          </div>
        )}
      </Paper>
    )
  }
)

FastTimeSeriesGraphNode.displayName = "FastTimeSeriesGraphNode"
