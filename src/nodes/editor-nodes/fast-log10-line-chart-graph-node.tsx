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
  Checkbox,
  Divider,
  FormControlLabel,
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
import { GraphEndpoint, PortData, PortDataType, PortValue } from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import {
  FastLineChartPlotData,
  FastLineChartGraphHandle,
  NumericArray,
} from "@/src/components/fast-line-chart-graph"
import { useThemeStore } from "@/src/stores/theme-store"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { useControlGates } from "@/src/hooks/use-control-gates"
import { ChartControlBar } from "@/src/components/chart-control-bar"
import { ControlGateHandles } from "@/src/components/control-gate-handles"
import { ControlModeToggle } from "@/src/components/control-mode-toggle"

const FastLineChartGraph = dynamic(
  () => import("@/src/components/fast-line-chart-graph"),
  {
    ssr: false,
  }
)

function isSupportedNumericType(dataType: PortDataType): boolean {
  switch (dataType) {
    case PortDataType.Float32:
    case PortDataType.Float64:
    case PortDataType.Int8:
    case PortDataType.Uint8:
    case PortDataType.Int16:
    case PortDataType.Uint16:
    case PortDataType.Int32:
    case PortDataType.Uint32:
    case PortDataType.Bool:
      return true
    default:
      return false
  }
}

function extractTraces(
  value: PortValue,
  traceDim: number,
  reuseBuffers: number[][] | undefined,
): { traces: NumericArray[]; buffers: number[][] | undefined } | undefined {
  const { shape } = value
  const array = value.array as NumericArray

  if (shape.length === 2) {
    const nSamples = shape[1]
    const offset = (shape[0] - 1) * nSamples
    return {
      traces: [array.slice(offset, offset + nSamples)],
      buffers: undefined,
    }
  }

  if (shape.length === 3) {
    const [batch, dim0, dim1] = shape
    const elemSize = dim0 * dim1
    const lastBatchOffset = (batch - 1) * elemSize
    const resolvedDim = traceDim < 0 ? 1 : traceDim

    if (resolvedDim === 1) {
      const nSamples = dim0
      const ch = dim1
      let buffers = reuseBuffers
      if (!buffers || buffers.length !== ch || buffers[0]?.length !== nSamples) {
        buffers = Array.from({ length: ch }, () => new Array(nSamples))
      }
      for (let i = 0; i < nSamples; i++) {
        const rowOffset = lastBatchOffset + i * ch
        for (let j = 0; j < ch; j++) {
          buffers[j][i] = array[rowOffset + j]
        }
      }
      return { traces: buffers, buffers }
    } else {
      const ch = dim0
      const nSamples = dim1
      const traces: NumericArray[] = []
      for (let j = 0; j < ch; j++) {
        const start = lastBatchOffset + j * nSamples
        traces.push(array.slice(start, start + nSamples))
      }
      return { traces, buffers: undefined }
    }
  }

  return undefined
}

const GraphWrapper = memo(
  ({
    graphEndpoint,
    recording,
    traceDim = -1,
    graphWidth = 480,
    graphHeight = 320,
    xRange,
    yRange,
    xLogScale,
    yLogScale,
    graphRef,
    viewportZoom = 1,
    onError,
  }: {
    graphEndpoint: GraphEndpoint | undefined
    recording: boolean
    traceDim?: number
    graphWidth?: number
    graphHeight?: number
    xRange?: { min?: number; max?: number }
    yRange?: { min?: number; max?: number }
    xLogScale?: boolean
    yLogScale?: boolean
    graphRef: React.RefObject<FastLineChartGraphHandle>
    viewportZoom?: number
    onError?: (error: string | undefined) => void
  }) => {
    const refRecording = useRef(recording)
    refRecording.current = recording

    const refTraceDim = useRef(traceDim)
    refTraceDim.current = traceDim

    const refXLabels = useRef<NumericArray | undefined>(undefined)
    const refTraceBuffers = useRef<number[][] | undefined>(undefined)

    const tracesConns = useHandleConnections({ type: "target", id: "traces" })
    const tracesSourcesData = useNodesData<BasicPortNode>(
      tracesConns[0]?.source
    )
    const refTracesSourcesData = useRef(tracesSourcesData)
    refTracesSourcesData.current = tracesSourcesData

    const xLabelsConns = useHandleConnections({ type: "target", id: "xLabels" })
    const xLabelsSourcesData = useNodesData<BasicPortNode>(
      xLabelsConns[0]?.source
    )
    const refXLabelsSourcesData = useRef(xLabelsSourcesData)
    refXLabelsSourcesData.current = xLabelsSourcesData

    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    const lastErrorRef = useRef<string | undefined>(undefined)

    const reportError = useCallback((error: string | undefined) => {
      if (error !== lastErrorRef.current) {
        lastErrorRef.current = error
        onErrorRef.current?.(error)
      }
    }, [])

    const [plotData, setPlotData] = useState<FastLineChartPlotData>({
      x: undefined,
      traces: [],
    })

    const onXLabelsCallback = useCallback((values: PortValue[]) => {
      const value = values[0]
      if (!value) return
      const array = value.array as NumericArray
      if (value.shape.length === 2) {
        const n = value.shape[1]
        const offset = (value.shape[0] - 1) * n
        refXLabels.current = array.slice(offset, offset + n)
      } else if (value.shape.length === 1) {
        refXLabels.current = array
      }
    }, [])

    const onTracesCallback = useCallback((values: PortValue[]) => {
      if (!refRecording.current) return

      const allTraces: NumericArray[] = []

      for (let i = 0; i < values.length; i++) {
        const value = values[i]
        if (!isSupportedNumericType(value.dataType)) {
          reportError(`Unsupported data type. (index: ${i}, type: ${value.dataType})`)
          return
        }

        const result = extractTraces(
          value,
          refTraceDim.current,
          refTraceBuffers.current,
        )
        if (!result) {
          reportError(
            `Invalid shape. Expected 2D or 3D array, got ${value.shape.length}D (index: ${i})`
          )
          return
        }
        if (result.buffers) {
          refTraceBuffers.current = result.buffers
        }
        allTraces.push(...result.traces)
      }

      reportError(undefined)
      setPlotData({
        x: refXLabels.current,
        traces: allTraces,
      })
    }, [reportError])

    useEffect(() => {
      const portName = xLabelsSourcesData?.data?.port.name
      if (!graphEndpoint || !portName) return

      graphEndpoint.fetchOutputValues(portName)
        .then(values => onXLabelsCallback(values))
        .catch(error => console.error(error))
    }, [graphEndpoint, xLabelsSourcesData, onXLabelsCallback])

    useEffect(() => {
      if (!graphEndpoint) return

      const onOutputCallback = (portData: PortData) => {
        if (
          refTracesSourcesData.current?.data.port.name === portData.portName
        ) {
          onTracesCallback(portData.values)
        } else if (
          refXLabelsSourcesData.current?.data.port.name === portData.portName
        ) {
          onXLabelsCallback(portData.values)
        }
      }

      graphEndpoint.addOutputCallback(onOutputCallback)

      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint, onTracesCallback, onXLabelsCallback])

    return (
      <FastLineChartGraph
        ref={graphRef}
        graphWidth={graphWidth}
        graphHeight={graphHeight}
        plotData={plotData}
        xRange={xRange}
        yRange={yRange}
        xLogScale={xLogScale}
        yLogScale={yLogScale}
        viewportZoom={viewportZoom}
      />
    )
  }
)

GraphWrapper.displayName = "GraphWrapper"

export type FastLog10LineChartGraphNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    graphWidth?: number
    graphHeight?: number
    traceDim?: number
    xLogScale?: boolean
    yLogScale?: boolean
    xMin?: number
    xMax?: number
    yMin?: number
    yMax?: number
  }
}>

export const FastLog10LineChartGraphNode = memo(
  (props: NodeProps<FastLog10LineChartGraphNode>) => {
    const { setNodes } = useReactFlow()
    const { zoom: viewportZoom } = useViewport()
    const [{ colors }] = useThemeStore()

    const graphRef = useRef<FastLineChartGraphHandle>(null)

    const graphWidth = props.data.nodeData?.graphWidth ?? 480
    const graphHeight = props.data.nodeData?.graphHeight ?? 320
    const traceDim = props.data.nodeData?.traceDim ?? -1

    const [xLogScale, setXLogScale] = useState(props.data.nodeData?.xLogScale ?? false)
    const [yLogScale, setYLogScale] = useState(props.data.nodeData?.yLogScale ?? false)
    const [xMin, setXMin] = useState(props.data.nodeData?.xMin ?? undefined)
    const [xMax, setXMax] = useState(props.data.nodeData?.xMax ?? undefined)
    const [yMin, setYMin] = useState(props.data.nodeData?.yMin ?? undefined)
    const [yMax, setYMax] = useState(props.data.nodeData?.yMax ?? undefined)

    const [graphWidthInput, setGraphWidthInput] = useState(graphWidth.toString())
    const [graphHeightInput, setGraphHeightInput] = useState(graphHeight.toString())
    const [traceDimInput, setTraceDimInput] = useState(traceDim.toString())
    const [xLogScaleInput, setXLogScaleInput] = useState(xLogScale)
    const [yLogScaleInput, setYLogScaleInput] = useState(yLogScale)
    const [xMinInput, setXMinInput] = useState(props.data.nodeData?.xMin?.toString() ?? "")
    const [xMaxInput, setXMaxInput] = useState(props.data.nodeData?.xMax?.toString() ?? "")
    const [yMinInput, setYMinInput] = useState(props.data.nodeData?.yMin?.toString() ?? "")
    const [yMaxInput, setYMaxInput] = useState(props.data.nodeData?.yMax?.toString() ?? "")

    const updateNodeData = useCallback(
      (newNodeData: Partial<NonNullable<FastLog10LineChartGraphNode["data"]["nodeData"]>>) => {
        setNodes(nodes =>
          nodes.map(node =>
            node.id === props.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    nodeData: { ...(node.data as FastLog10LineChartGraphNode["data"]).nodeData, ...newNodeData },
                  },
                }
              : node
          )
        )
      },
      [props.id, setNodes]
    )

    const [isRecording, setIsRecording] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [graphError, setGraphError] = useState<string | undefined>()

    // Flow-driven control: active only while the rec handle is connected
    // (manual operation as before when unconnected). Snapshot-style chart,
    // so there is no clear concept (rec gate only).
    const { recConnected, clearConnected, gateError, mode, setMode, recSignal } =
      useControlGates({
        graphEndpoint: props.data.graphEndpoint,
        onRecChange: setIsRecording,
      })

    // Data errors from the plot pipeline and control-gate wiring errors share
    // the node's error indicator.
    const displayError =
      [graphError, gateError].filter(Boolean).join("\n") || undefined

    const editorModelUpdater = props.data.editorModelUpdater

    useEffect(() => {
      if (props.data.nodeData?.graphWidth !== undefined) {
        setGraphWidthInput(props.data.nodeData.graphWidth.toString())
      }
      if (props.data.nodeData?.graphHeight !== undefined) {
        setGraphHeightInput(props.data.nodeData.graphHeight.toString())
      }
      if (props.data.nodeData?.traceDim !== undefined) {
        setTraceDimInput(props.data.nodeData.traceDim.toString())
      }
      if (props.data.nodeData?.xLogScale !== undefined) {
        setXLogScaleInput(props.data.nodeData.xLogScale)
        setXLogScale(props.data.nodeData.xLogScale)
      }
      if (props.data.nodeData?.yLogScale !== undefined) {
        setYLogScaleInput(props.data.nodeData.yLogScale)
        setYLogScale(props.data.nodeData.yLogScale)
      }
      if (props.data.nodeData?.xMin != null) {
        setXMinInput(props.data.nodeData.xMin.toString())
        setXMin(props.data.nodeData.xMin)
      } else {
        setXMinInput("")
        setXMin(undefined)
      }
      if (props.data.nodeData?.xMax != null) {
        setXMaxInput(props.data.nodeData.xMax.toString())
        setXMax(props.data.nodeData.xMax)
      } else {
        setXMaxInput("")
        setXMax(undefined)
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
      props.data.nodeData?.graphWidth,
      props.data.nodeData?.graphHeight,
      props.data.nodeData?.traceDim,
      props.data.nodeData?.xLogScale,
      props.data.nodeData?.yLogScale,
      props.data.nodeData?.xMin,
      props.data.nodeData?.xMax,
      props.data.nodeData?.yMin,
      props.data.nodeData?.yMax,
    ])

    const applySettings = useCallback(async () => {
      const width = Number(graphWidthInput)
      const height = Number(graphHeightInput)
      const traceDimVal = Number(traceDimInput)
      const xMinVal = xMinInput ? Number(xMinInput) : undefined
      const xMaxVal = xMaxInput ? Number(xMaxInput) : undefined
      const yMinVal = yMinInput ? Number(yMinInput) : undefined
      const yMaxVal = yMaxInput ? Number(yMaxInput) : undefined

      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        enqueueSnackbar("Invalid graph size", { variant: "error" })
        return
      }
      if (isNaN(traceDimVal)) {
        enqueueSnackbar("Invalid trace dim", { variant: "error" })
        return
      }
      // Log scale validation: range values must be > 0
      if (xLogScaleInput) {
        if ((xMinVal !== undefined && xMinVal <= 0) || (xMaxVal !== undefined && xMaxVal <= 0)) {
          enqueueSnackbar("Range values must be greater than 0 for log scale", { variant: "error" })
          return
        }
      }
      if (yLogScaleInput) {
        if ((yMinVal !== undefined && yMinVal <= 0) || (yMaxVal !== undefined && yMaxVal <= 0)) {
          enqueueSnackbar("Range values must be greater than 0 for log scale", { variant: "error" })
          return
        }
      }
      if (
        (xMinVal !== undefined && xMaxVal !== undefined && xMinVal >= xMaxVal) ||
        (yMinVal !== undefined && yMaxVal !== undefined && yMinVal >= yMaxVal)
      ) {
        enqueueSnackbar("Min value must be less than Max value", { variant: "error" })
        return
      }

      const updates = {
        graphWidth: width,
        graphHeight: height,
        traceDim: traceDimVal,
        xLogScale: xLogScaleInput,
        yLogScale: yLogScaleInput,
        xMin: xMinVal,
        xMax: xMaxVal,
        yMin: yMinVal,
        yMax: yMaxVal,
      }

      updateNodeData(updates)
      editorModelUpdater.patchNodeData(props.id, updates)
      setXLogScale(xLogScaleInput)
      setYLogScale(yLogScaleInput)
      setXMin(xMinVal)
      setXMax(xMaxVal)
      setYMin(yMinVal)
      setYMax(yMaxVal)
    }, [graphWidthInput, graphHeightInput, traceDimInput, xLogScaleInput, yLogScaleInput, xMinInput, xMaxInput, yMinInput, yMaxInput, updateNodeData, editorModelUpdater, props.id])

    const xRange = useMemo(() => {
      if (xMin === undefined && xMax === undefined) return undefined
      return { min: xMin, max: xMax }
    }, [xMin, xMax])

    const yRange = useMemo(() => {
      if (yMin === undefined && yMax === undefined) return undefined
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
            <NodeHandleLeft id="xLabels" label="xLabels" />
            <NodeHandleLeft id="traces" label="traces" />
            <ControlGateHandles withClear={false} />
          </div>
          <div css={css({ flexGrow: 1 })} />
          {recConnected && (
            <div
              css={css({
                display: "flex",
                alignItems: "center",
                padding: "0 8px",
              })}
            >
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
            mode={mode}
            recConnected={recConnected}
            clearConnected={clearConnected}
          />
          <GraphWrapper
            graphEndpoint={props.data.graphEndpoint}
            recording={isRecording}
            traceDim={traceDim}
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            xRange={xRange}
            yRange={yRange}
            xLogScale={xLogScale}
            yLogScale={yLogScale}
            graphRef={graphRef}
            viewportZoom={viewportZoom}
            onError={setGraphError}
          />
        </div>
        {/* Bottom bar */}
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
              <TextField
                label="Trace Dim"
                size="small"
                value={traceDimInput}
                onChange={event => setTraceDimInput(event.target.value)}
                helperText="-1: last dim (default), 0: first dim"
                fullWidth
              />
              <Divider />
              <div css={css({ display: "flex", flexDirection: "row", gap: 8 })}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={xLogScaleInput}
                      onChange={event => setXLogScaleInput(event.target.checked)}
                      size="small"
                    />
                  }
                  label="X Log10"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={yLogScaleInput}
                      onChange={event => setYLogScaleInput(event.target.checked)}
                      size="small"
                    />
                  }
                  label="Y Log10"
                />
              </div>
              <div css={css({ display: "flex", flexDirection: "row", gap: 8 })}>
                <TextField
                  label="X Min"
                  size="small"
                  value={xMinInput}
                  onChange={event => setXMinInput(event.target.value)}
                  placeholder="auto"
                  css={css({ flexGrow: 1 })}
                />
                <TextField
                  label="X Max"
                  size="small"
                  value={xMaxInput}
                  onChange={event => setXMaxInput(event.target.value)}
                  placeholder="auto"
                  css={css({ flexGrow: 1 })}
                />
              </div>
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

FastLog10LineChartGraphNode.displayName = "FastLog10LineChartGraphNode"
