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
import {
  GraphEndpoint,
  PortData,
  PortDataType,
  PortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { FastHeatmapGraphHandle } from "@/src/components/fast-heatmap-graph"
import { buildPortlandLut, HeatmapRaster } from "@/src/lib/heatmap-raster"
import { useThemeStore } from "@/src/stores/theme-store"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { useControlGates } from "@/src/hooks/use-control-gates"
import { ChartControlBar } from "@/src/components/chart-control-bar"
import { ControlGateHandles } from "@/src/components/control-gate-handles"
import { ControlModeToggle } from "@/src/components/control-mode-toggle"

const FastHeatmapGraph = dynamic(
  () => import("@/src/components/fast-heatmap-graph"),
  {
    ssr: false,
  }
)

// Relative z-range drift below this fraction of the span repaints only the
// dirty columns; larger drift triggers a full repaint with the new range.
const Z_RANGE_EPSILON = 1e-3

interface PaintState {
  version: number
  cursor: number
  z?: { min: number; max: number }
}

const GraphWrapper = memo(
  ({
    graphEndpoint,
    recording,
    xLength,
    revision,
    graphWidth = 480,
    graphHeight = 320,
    yRange,
    zMin,
    zMax,
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
    zMin?: number
    zMax?: number
    graphRef: React.RefObject<FastHeatmapGraphHandle>
    viewportZoom?: number
    onError?: (error: string | undefined) => void
  }) => {
    const refRecording = useRef(recording)
    refRecording.current = recording

    const refXLength = useRef(xLength)
    refXLength.current = xLength

    const zMinRef = useRef(zMin)
    zMinRef.current = zMin
    const zMaxRef = useRef(zMax)
    zMaxRef.current = zMax

    // ---
    const seriesConns = useHandleConnections({ type: "target", id: "series" })
    const seriesSourcesData = useNodesData<BasicPortNode>(
      seriesConns[0]?.source
    )
    const seriesSourcesDataRef = useRef(seriesSourcesData)
    seriesSourcesDataRef.current = seriesSourcesData
    // ---
    const yLabelsConns = useHandleConnections({
      type: "target",
      id: "yLabels",
    })
    const yLabelsSourcesData = useNodesData<BasicPortNode>(
      yLabelsConns[0]?.source
    )
    const yLabelsSourcesDataRef = useRef(yLabelsSourcesData)
    yLabelsSourcesDataRef.current = yLabelsSourcesData
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

    // Stable raster instance; buffers are only allocated by configure().
    const rasterRef = useRef<HeatmapRaster | null>(null)
    if (!rasterRef.current) {
      rasterRef.current = new HeatmapRaster()
    }
    const lutRef = useRef<Uint8ClampedArray | null>(null)
    if (!lutRef.current) {
      lutRef.current = buildPortlandLut()
    }

    // z range used for the last full repaint. Incremental column painting
    // must reuse it exactly, otherwise old and new columns diverge.
    const lastPaintZRef = useRef<{ min: number; max: number } | undefined>()

    const [paintState, setPaintState] = useState<PaintState>({
      version: 0,
      cursor: 0,
    })
    const [yLabels, setYLabels] = useState<Float32Array | undefined>()

    // Resolves the effective z range (settings override the measured range
    // per bound) and repaints: everything when the range moved beyond the
    // epsilon, only the dirty columns otherwise.
    const paintDirty = useCallback((dirty: readonly number[]) => {
      const raster = rasterRef.current!
      const lut = lutRef.current!

      let effMin = zMinRef.current
      let effMax = zMaxRef.current
      if (effMin === undefined || effMax === undefined) {
        const measured = raster.computeMinMax()
        if (measured) {
          effMin = effMin ?? measured.min
          effMax = effMax ?? measured.max
        }
      }
      effMin = effMin ?? 0
      effMax = effMax ?? 1

      const last = lastPaintZRef.current
      const span = Math.max(Math.abs(effMax - effMin), 1e-12)
      const rangeMoved =
        !last ||
        Math.abs(last.min - effMin) > span * Z_RANGE_EPSILON ||
        Math.abs(last.max - effMax) > span * Z_RANGE_EPSILON

      if (rangeMoved) {
        lastPaintZRef.current = { min: effMin, max: effMax }
        raster.paintAll(effMin, effMax, lut)
      } else if (dirty.length > 0) {
        raster.paintColumns(dirty, last!.min, last!.max, lut)
      }

      setPaintState(prev => ({
        version: prev.version + 1,
        cursor: raster.cursor,
        z: lastPaintZRef.current,
      }))
    }, [])

    const onSeriesCallback = useCallback(
      (values: PortValue[]) => {
        if (!refRecording.current) {
          return
        }

        const value = values[0]
        if (value.shape.length !== 2) {
          reportError(
            `Invalid shape. Expected 2D array, got ${value.shape.length}D`
          )
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
            break
          default:
            reportError(`Unsupported data type. (type: ${value.dataType})`)
            return
        }

        // value.array is flat, value.shape is [batch, yLength]
        const batchSize = value.shape[0]
        const yLength = value.shape[1]
        if (batchSize <= 0 || yLength <= 0) {
          return
        }

        const raster = rasterRef.current!
        if (
          raster.xLength !== refXLength.current ||
          raster.yLength !== yLength
        ) {
          raster.configure(refXLength.current, yLength)
          lastPaintZRef.current = undefined
        }

        const dirty = raster.writeColumns(
          value.array as ArrayLike<number>,
          batchSize
        )
        reportError(undefined)
        paintDirty(dirty)
      },
      [paintDirty, reportError]
    )

    const onYLabelsCallback = useCallback((values: PortValue[]) => {
      const value = values[0]
      if (value.shape.length !== 2) {
        return
      }
      if (value.dataType !== PortDataType.Float32) {
        return
      }
      const labels = (value.array as Float32Array).slice(-value.shape[1])
      // Update state only when the content actually changed; y-label ports
      // may re-dispatch identical arrays every frame.
      setYLabels(prev => {
        if (prev && prev.length === labels.length) {
          let same = true
          for (let i = 0; i < labels.length; i++) {
            if (prev[i] !== labels[i]) {
              same = false
              break
            }
          }
          if (same) {
            return prev
          }
        }
        return labels
      })
    }, [])

    // Prime yLabels from the REST snapshot so a chart opened mid-session
    // gets its axis before the next dispatch.
    useEffect(() => {
      const portName = yLabelsSourcesData?.data?.port.name
      if (!graphEndpoint || !portName) {
        return
      }

      graphEndpoint
        .fetchOutputValues(portName)
        .then(values => {
          onYLabelsCallback(values)
        })
        .catch(error => {
          console.error(error)
        })
    }, [graphEndpoint, yLabelsSourcesData, onYLabelsCallback])

    useEffect(() => {
      if (!graphEndpoint) {
        return
      }

      const onOutputCallback = (portData: PortData) => {
        if (
          seriesSourcesDataRef.current?.data.port.name === portData.portName
        ) {
          onSeriesCallback(portData.values)
        } else if (
          yLabelsSourcesDataRef.current?.data.port.name === portData.portName
        ) {
          onYLabelsCallback(portData.values)
        }
      }

      graphEndpoint.addOutputCallback(onOutputCallback)

      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint, onSeriesCallback, onYLabelsCallback])

    // Clear (manual button or the clear gate).
    const isFirstRevisionRef = useRef(true)
    useEffect(() => {
      if (isFirstRevisionRef.current) {
        isFirstRevisionRef.current = false
        return
      }
      const raster = rasterRef.current!
      raster.clear()
      lastPaintZRef.current = undefined
      setPaintState(prev => ({
        version: prev.version + 1,
        cursor: 0,
        z: undefined,
      }))
    }, [revision])

    // Ring length change: reallocate (drops history, like the other charts).
    useEffect(() => {
      const raster = rasterRef.current!
      if (raster.yLength === 0 || raster.xLength === xLength) {
        return
      }
      raster.configure(xLength, raster.yLength)
      lastPaintZRef.current = undefined
      setPaintState(prev => ({
        version: prev.version + 1,
        cursor: 0,
        z: undefined,
      }))
    }, [xLength])

    // zMin/zMax setting change: repaint the existing pixels with the new range.
    const isFirstZRef = useRef(true)
    useEffect(() => {
      if (isFirstZRef.current) {
        isFirstZRef.current = false
        return
      }
      if (rasterRef.current!.yLength === 0) {
        return
      }
      paintDirty([])
    }, [zMin, zMax, paintDirty])

    return (
      <FastHeatmapGraph
        ref={graphRef}
        raster={rasterRef.current}
        paintVersion={paintState.version}
        cursorPosition={paintState.cursor}
        yLabels={yLabels}
        graphWidth={graphWidth}
        graphHeight={graphHeight}
        yRange={yRange}
        zRange={paintState.z}
        viewportZoom={viewportZoom}
      />
    )
  }
)

GraphWrapper.displayName = "GraphWrapper"

export type FastHeatmapGraphNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    xLength?: number
    graphWidth?: number
    graphHeight?: number
    yMin?: number
    yMax?: number
    zMin?: number
    zMax?: number
  }
}>

export const FastHeatmapGraphNode = memo(
  (props: NodeProps<FastHeatmapGraphNode>) => {
    const { setNodes } = useReactFlow()
    const { zoom: viewportZoom } = useViewport()
    const [{ colors }] = useThemeStore()

    const graphRef = useRef<FastHeatmapGraphHandle>(null)

    const xLength = props.data.nodeData?.xLength ?? 500
    const graphWidth = props.data.nodeData?.graphWidth ?? 480
    const graphHeight = props.data.nodeData?.graphHeight ?? 320

    // Y/Z ranges: undefined = auto (yLabels bounds / measured data range)
    const [yMin, setYMin] = useState(props.data.nodeData?.yMin ?? undefined)
    const [yMax, setYMax] = useState(props.data.nodeData?.yMax ?? undefined)
    const [zMin, setZMin] = useState(props.data.nodeData?.zMin ?? undefined)
    const [zMax, setZMax] = useState(props.data.nodeData?.zMax ?? undefined)

    const [xLengthInput, setXLengthInput] = useState(xLength.toString())
    const [graphWidthInput, setGraphWidthInput] = useState(
      graphWidth.toString()
    )
    const [graphHeightInput, setGraphHeightInput] = useState(
      graphHeight.toString()
    )
    // Empty string = undefined = auto
    const [yMinInput, setYMinInput] = useState(
      props.data.nodeData?.yMin?.toString() ?? ""
    )
    const [yMaxInput, setYMaxInput] = useState(
      props.data.nodeData?.yMax?.toString() ?? ""
    )
    const [zMinInput, setZMinInput] = useState(
      props.data.nodeData?.zMin?.toString() ?? ""
    )
    const [zMaxInput, setZMaxInput] = useState(
      props.data.nodeData?.zMax?.toString() ?? ""
    )

    const updateNodeData = useCallback(
      (
        newNodeData: Partial<
          NonNullable<FastHeatmapGraphNode["data"]["nodeData"]>
        >
      ) => {
        setNodes(nodes =>
          nodes.map(node =>
            node.id === props.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    nodeData: {
                      ...(node.data as FastHeatmapGraphNode["data"]).nodeData,
                      ...newNodeData,
                    },
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
      if (props.data.nodeData?.zMin != null) {
        setZMinInput(props.data.nodeData.zMin.toString())
        setZMin(props.data.nodeData.zMin)
      } else {
        setZMinInput("")
        setZMin(undefined)
      }
      if (props.data.nodeData?.zMax != null) {
        setZMaxInput(props.data.nodeData.zMax.toString())
        setZMax(props.data.nodeData.zMax)
      } else {
        setZMaxInput("")
        setZMax(undefined)
      }
    }, [
      props.data.nodeData?.xLength,
      props.data.nodeData?.graphWidth,
      props.data.nodeData?.graphHeight,
      props.data.nodeData?.yMin,
      props.data.nodeData?.yMax,
      props.data.nodeData?.zMin,
      props.data.nodeData?.zMax,
    ])

    const applySettings = useCallback(async () => {
      const xLen = Number(xLengthInput)
      const width = Number(graphWidthInput)
      const height = Number(graphHeightInput)
      const yMinVal = yMinInput ? Number(yMinInput) : undefined
      const yMaxVal = yMaxInput ? Number(yMaxInput) : undefined
      const zMinVal = zMinInput ? Number(zMinInput) : undefined
      const zMaxVal = zMaxInput ? Number(zMaxInput) : undefined

      if (isNaN(xLen) || xLen <= 0) {
        enqueueSnackbar("Invalid X Length", { variant: "error" })
        return
      }
      if (xLen > 10000) {
        enqueueSnackbar("X Length too large (max: 10000)", {
          variant: "error",
        })
        return
      }
      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        enqueueSnackbar("Invalid graph size", { variant: "error" })
        return
      }
      if (
        (yMinVal !== undefined && isNaN(yMinVal)) ||
        (yMaxVal !== undefined && isNaN(yMaxVal))
      ) {
        enqueueSnackbar("Invalid Y range value", { variant: "error" })
        return
      }
      if (yMinVal !== undefined && yMaxVal !== undefined && yMinVal >= yMaxVal) {
        enqueueSnackbar("Y Min must be less than Y Max", { variant: "error" })
        return
      }
      if (
        (zMinVal !== undefined && isNaN(zMinVal)) ||
        (zMaxVal !== undefined && isNaN(zMaxVal))
      ) {
        enqueueSnackbar("Invalid Z range value", { variant: "error" })
        return
      }
      if (zMinVal !== undefined && zMaxVal !== undefined && zMinVal >= zMaxVal) {
        enqueueSnackbar("Z Min must be less than Z Max", { variant: "error" })
        return
      }

      const updates: Partial<
        NonNullable<FastHeatmapGraphNode["data"]["nodeData"]>
      > = {
        xLength: xLen,
        graphWidth: width,
        graphHeight: height,
        yMin: yMinVal,
        yMax: yMaxVal,
        zMin: zMinVal,
        zMax: zMaxVal,
      }

      updateNodeData(updates)
      editorModelUpdater.patchNodeData(props.id, {
        xLength: xLen,
        graphWidth: width,
        graphHeight: height,
        yMin: yMinVal,
        yMax: yMaxVal,
        zMin: zMinVal,
        zMax: zMaxVal,
      })
      setYMin(yMinVal)
      setYMax(yMaxVal)
      setZMin(zMinVal)
      setZMax(zMaxVal)
    }, [
      xLengthInput,
      graphWidthInput,
      graphHeightInput,
      yMinInput,
      yMaxInput,
      zMinInput,
      zMaxInput,
      updateNodeData,
      editorModelUpdater,
      props.id,
    ])

    // Partial auto-range: either bound may be left unset.
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
        <div
          css={css({
            display: "flex",
            flexDirection: "row",
            overflow: "hidden",
          })}
        >
          <div css={css({ display: "flex", flexDirection: "column" })}>
            <NodeHandleLeft id="series" label="series" />
            <NodeHandleLeft id="yLabels" label="yLabels" />
            <ControlGateHandles withClear />
          </div>
          <div css={css({ flexGrow: 1 })} />
          {(recConnected || clearConnected) && (
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
            zMin={zMin}
            zMax={zMax}
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
              title={
                <span style={{ whiteSpace: "pre-line" }}>{displayError}</span>
              }
              arrow
            >
              <ErrorOutlineIcon
                css={css({ fontSize: 14, color: colors.error })}
              />
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
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)",
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
                <ErrorOutlineIcon
                  css={css({ fontSize: 14, flexShrink: 0, marginTop: 1 })}
                />
                <span
                  css={css({
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  })}
                >
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
              <div css={css({ display: "flex", flexDirection: "row", gap: 8 })}>
                <TextField
                  label="Z Min"
                  size="small"
                  value={zMinInput}
                  onChange={event => setZMinInput(event.target.value)}
                  placeholder="auto"
                  css={css({ flexGrow: 1 })}
                />
                <TextField
                  label="Z Max"
                  size="small"
                  value={zMaxInput}
                  onChange={event => setZMaxInput(event.target.value)}
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

FastHeatmapGraphNode.displayName = "FastHeatmapGraphNode"
