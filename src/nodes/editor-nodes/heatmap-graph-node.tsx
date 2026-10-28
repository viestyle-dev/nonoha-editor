"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useHandleConnections,
  useNodesData,
  useReactFlow,
} from "@xyflow/react"
import { css } from "@emotion/react"
import {
  GraphEndpoint,
  PortData,
  PortDataType,
  PortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { useThemeStore } from "@/src/stores/theme-store"
import {
  Button,
  Collapse,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
} from "@mui/material"
import { NodeHandleLeft } from "@/src/components/node-handle"
import dynamic from "next/dynamic"
import { HeatmapPlotData } from "@/src/components/heatmap-graph"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { ExpandLess, ExpandMore } from "@mui/icons-material"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import { enqueueSnackbar } from "notistack"
import { useControlGates } from "@/src/hooks/use-control-gates"
import { ChartControlBar } from "@/src/components/chart-control-bar"
import { ControlGateHandles } from "@/src/components/control-gate-handles"
import { ControlModeToggle } from "@/src/components/control-mode-toggle"

const HeatmapGraph = dynamic(() => import("@/src/components/heatmap-graph"), {
  ssr: false,
})

const GraphWrapper = memo(
  ({
    graphEndpoint,
    recording,
    plotType,
    xLength,
    revision,
    graphWidth = 480,
    graphHeight = 320,
    zMin,
    zMax,
  }: {
    graphEndpoint: GraphEndpoint | undefined
    recording: boolean
    plotType: "heatmap" | "surface"
    xLength: number
    revision: number
    graphWidth?: number
    graphHeight?: number
    zMin?: number
    zMax?: number
  }) => {
    const refRecording = useRef(recording)
    refRecording.current = recording

    const xLengthRef = useRef(xLength)
    xLengthRef.current = xLength

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

    const plotZRef = useRef<number[][]>([])
    const yLabelsRef = useRef<Float32Array | undefined>()

    const [plotData, setPlotData] = useState<HeatmapPlotData>({
      z: plotZRef.current,
      cursorPosition: 0,
    })

    const currentCursorPosition = useRef(0)

    const [{ colors }] = useThemeStore()

    const [errorMessage, setErrorMessage] = useState<string | undefined>(
      undefined
    )

    const clearPlot = useCallback(() => {
      currentCursorPosition.current = 0
      const plotZ = plotZRef.current
      for (let y = 0; y < plotZ.length; ++y) {
        for (let x = 0; x < plotZ[y].length; ++x) {
          plotZ[y][x] = 0
        }
      }
      setPlotData({ z: plotZ, cursorPosition: 0 })
    }, [])

    useEffect(() => {
      clearPlot()
    }, [revision, clearPlot])

    const onSeriesCallback = useCallback((values: PortValue[]) => {
      if (!refRecording.current) {
        return
      }

      const value = values[0]
      if (value.shape.length !== 2) {
        setErrorMessage(
          `Invalid shape. Expected 2D array, got ${value.shape.length}D`
        )
        return
      }
      if (
        value.dataType === PortDataType.String ||
        value.dataType === PortDataType.Int64 ||
        value.dataType === PortDataType.Uint64
      ) {
        setErrorMessage(`Invalid data type, got ${value.dataType}`)
        return
      }

      // value.array is flat, value.shape is [batch, yLength]
      const batchSize = value.shape[0]
      const yLength = value.shape[1]
      const xLength = xLengthRef.current

      if (
        plotZRef.current.length !== yLength ||
        xLength !== plotZRef.current[0]?.length
      ) {
        // Reallocate z
        plotZRef.current = new Array(yLength)
          .fill(0)
          .map(() => new Array(xLength).fill(0))
      }

      const plotZ = plotZRef.current
      const appendCount = batchSize
      const nextCursorPosition =
        (currentCursorPosition.current + appendCount) % xLength

      // Extract vectors from flat array
      const vectors: number[][] = []
      for (let b = 0; b < batchSize; b++) {
        const vec: number[] = []
        for (let y = 0; y < yLength; y++) {
          vec.push(value.array[b * yLength + y])
        }
        vectors.push(vec)
      }

      if (nextCursorPosition - appendCount >= 0) {
        for (let x = 0; x < appendCount; ++x) {
          for (let y = 0; y < yLength; ++y) {
            plotZ[y][nextCursorPosition - appendCount + x] = vectors[x][y]
          }
        }
      } else {
        for (let x = 0; x < nextCursorPosition; ++x) {
          for (let y = 0; y < yLength; ++y) {
            plotZ[y][x] = vectors[appendCount - nextCursorPosition + x][y]
          }
        }
        let first = xLength - (appendCount - nextCursorPosition)
        if (first < nextCursorPosition) {
          first = nextCursorPosition
        }
        for (let x = first; x < xLength; ++x) {
          for (let y = 0; y < yLength; ++y) {
            plotZ[y][x] = vectors[x - first][y]
          }
        }
      }

      currentCursorPosition.current = nextCursorPosition
      setPlotData({ z: plotZ, cursorPosition: currentCursorPosition.current })
      setErrorMessage(undefined)
    }, [])

    const onYLabelsCallback = useCallback((values: PortValue[]) => {
      const value = values[0]
      if (value.shape.length !== 2) {
        return
      }
      if (value.dataType !== PortDataType.Float32) {
        return
      }
      const yLabels = value.array.slice(-value.shape[1])
      yLabelsRef.current = yLabels
    }, [])

    useEffect(() => {
      const portName = yLabelsSourcesData?.data?.port.name
      if (!graphEndpoint || !portName) {
        return
      }

      graphEndpoint.fetchOutputValues(portName)
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

    return (
      <div style={{ width: graphWidth, height: graphHeight }}>
        <HeatmapGraph
          style={{ width: graphWidth, height: graphHeight }}
          plotData={plotData}
          layout={{
            width: graphWidth,
            height: graphHeight,
          }}
          yLabels={yLabelsRef.current}
          type={plotType}
          zMin={zMin}
          zMax={zMax}
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

export type HeatmapGraphNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    graphWidth?: number
    graphHeight?: number
    xLength?: number
    plotType?: "heatmap" | "surface"
    zMin?: number
    zMax?: number
  }
}>

export const HeatmapGraphNode = memo((props: NodeProps<HeatmapGraphNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  const [graphWidth, setGraphWidth] = useState(props.data.nodeData?.graphWidth ?? 480)
  const [graphHeight, setGraphHeight] = useState(props.data.nodeData?.graphHeight ?? 320)
  const [xLength, setXLength] = useState(props.data.nodeData?.xLength ?? 500)
  const [plotType, setPlotType] = useState<"heatmap" | "surface">(
    props.data.nodeData?.plotType ?? "heatmap"
  )
  const [zMin, setZMin] = useState<number | undefined>(props.data.nodeData?.zMin)
  const [zMax, setZMax] = useState<number | undefined>(props.data.nodeData?.zMax)

  const [graphWidthInput, setGraphWidthInput] = useState((props.data.nodeData?.graphWidth ?? 480).toString())
  const [graphHeightInput, setGraphHeightInput] = useState((props.data.nodeData?.graphHeight ?? 320).toString())
  const [xLengthInput, setXLengthInput] = useState((props.data.nodeData?.xLength ?? 500).toString())
  const [zMinInput, setZMinInput] = useState(props.data.nodeData?.zMin?.toString() ?? "")
  const [zMaxInput, setZMaxInput] = useState(props.data.nodeData?.zMax?.toString() ?? "")

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<HeatmapGraphNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as HeatmapGraphNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
      // Update local state immediately
      if (newNodeData.graphWidth !== undefined) {
        setGraphWidth(newNodeData.graphWidth)
      }
      if (newNodeData.graphHeight !== undefined) {
        setGraphHeight(newNodeData.graphHeight)
      }
      if (newNodeData.xLength !== undefined) {
        setXLength(newNodeData.xLength)
      }
      if (newNodeData.plotType !== undefined) {
        setPlotType(newNodeData.plotType)
      }
      if ("zMin" in newNodeData) {
        setZMin(newNodeData.zMin)
      }
      if ("zMax" in newNodeData) {
        setZMax(newNodeData.zMax)
      }
    },
    [props.id, setNodes]
  )

  const [isRecording, setIsRecording] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [graphRevision, setGraphRevision] = useState(0)

  // Flow-driven control: active only while the rec/clear handles are
  // connected (manual operation as before when unconnected).
  const { recConnected, clearConnected, gateError, mode, setMode, recSignal } =
    useControlGates({
      graphEndpoint: props.data.graphEndpoint,
      onRecChange: setIsRecording,
      onClear: () => setGraphRevision(prev => prev + 1),
    })

  const [titleEditing, setTitleEditing] = useState(false)

  const editorModelUpdater = props.data.editorModelUpdater

  // Sync input fields when props.data changes (e.g., from copy/paste or external updates)
  useEffect(() => {
    if (props.data.nodeData?.graphWidth !== undefined) {
      setGraphWidthInput(props.data.nodeData.graphWidth.toString())
    }
    if (props.data.nodeData?.graphHeight !== undefined) {
      setGraphHeightInput(props.data.nodeData.graphHeight.toString())
    }
    if (props.data.nodeData?.xLength !== undefined) {
      setXLengthInput(props.data.nodeData.xLength.toString())
    }
    if (props.data.nodeData?.zMin !== undefined) {
      setZMinInput(props.data.nodeData.zMin.toString())
    }
    if (props.data.nodeData?.zMax !== undefined) {
      setZMaxInput(props.data.nodeData.zMax.toString())
    }
  }, [
    props.data.nodeData?.graphWidth,
    props.data.nodeData?.graphHeight,
    props.data.nodeData?.xLength,
    props.data.nodeData?.zMin,
    props.data.nodeData?.zMax,
  ])

  const applySettings = async () => {
    const width = Number(graphWidthInput)
    const height = Number(graphHeightInput)
    const xLen = Number(xLengthInput)

    if (isNaN(width) || isNaN(height) || isNaN(xLen)) {
      enqueueSnackbar("Invalid number", { variant: "error" })
      return
    }

    if (width <= 0 || height <= 0 || xLen <= 0) {
      enqueueSnackbar("Values must be positive", { variant: "error" })
      return
    }

    if (xLen > 2000) {
      enqueueSnackbar("X Length too large (max 2000)", { variant: "error" })
      return
    }

    // Parse zMin/zMax (empty string = undefined)
    const newZMin = zMinInput ? Number(zMinInput) : undefined
    const newZMax = zMaxInput ? Number(zMaxInput) : undefined

    if (newZMin !== undefined && isNaN(newZMin)) {
      enqueueSnackbar("Invalid Z Min value", { variant: "error" })
      return
    }

    if (newZMax !== undefined && isNaN(newZMax)) {
      enqueueSnackbar("Invalid Z Max value", { variant: "error" })
      return
    }

    if (newZMin !== undefined && newZMax !== undefined && newZMin >= newZMax) {
      enqueueSnackbar("Z Min must be less than Z Max", { variant: "error" })
      return
    }

    const updates: Partial<NonNullable<HeatmapGraphNode["data"]["nodeData"]>> = {
      graphWidth: width,
      graphHeight: height,
      xLength: xLen,
      zMin: newZMin,
      zMax: newZMax,
    }

    updateNodeData(updates)
    editorModelUpdater.patchNodeData(props.id, updates)
  }

  const handlePlotTypeChange = (value: "heatmap" | "surface") => {
    updateNodeData({ plotType: value })
    editorModelUpdater.patchNodeData(props.id, { plotType: value })
  }

  return (
    <Paper
      css={css({
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        color: colors.onSurface,
        background: colors.surfaceContainerHighest,
        outlineOffset: "4px",
      })}
      style={{
        outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
        width: Math.max(graphWidth + 15, 300),
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
      <div
        css={css`
          display: flex;
          flex-direction: column;
          padding: 8px;
        `}
      >
        <div
          css={css({
            display: "flex",
            flexDirection: "row",
            gap: 8,
          })}
        >
          <ChartControlBar
            recording={isRecording}
            onRecordingChange={setIsRecording}
            onClear={() => setGraphRevision(prev => prev + 1)}
            mode={mode}
            recConnected={recConnected}
            clearConnected={clearConnected}
          />
          {gateError && (
            <Tooltip
              title={<span style={{ whiteSpace: "pre-line" }}>{gateError}</span>}
              arrow
            >
              <ErrorOutlineIcon
                css={css({
                  fontSize: 14,
                  color: colors.error,
                  alignSelf: "center",
                })}
              />
            </Tooltip>
          )}
        </div>
        <GraphWrapper
          graphEndpoint={props.data.graphEndpoint}
          recording={isRecording}
          plotType={plotType}
          xLength={xLength}
          revision={graphRevision}
          graphWidth={graphWidth}
          graphHeight={graphHeight}
          zMin={zMin}
          zMax={zMax}
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
            <div
              css={css({
                display: "flex",
                flexDirection: "row",
                gap: 8,
              })}
            >
              <TextField
                label="X Length"
                size="small"
                value={xLengthInput}
                onChange={event => {
                  setXLengthInput(event.target.value)
                }}
                css={css({
                  flexGrow: 1,
                })}
              />
            </div>
            <FormControl size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={plotType}
                label="Type"
                onChange={event => {
                  handlePlotTypeChange(
                    event.target.value as "heatmap" | "surface"
                  )
                }}
              >
                <MenuItem value="heatmap">Heatmap</MenuItem>
                <MenuItem value="surface">Surface</MenuItem>
              </Select>
            </FormControl>
            <div
              css={css({
                display: "flex",
                flexDirection: "row",
                gap: 8,
              })}
            >
              <TextField
                label="Z Min"
                size="small"
                value={zMinInput}
                onChange={event => {
                  setZMinInput(event.target.value)
                }}
                css={css({ flexGrow: 1 })}
              />
              <TextField
                label="Z Max"
                size="small"
                value={zMaxInput}
                onChange={event => {
                  setZMaxInput(event.target.value)
                }}
                css={css({ flexGrow: 1 })}
              />
            </div>
            <Button variant="text" size="small" onClick={applySettings}>
              Apply Settings
            </Button>
          </div>
        </Collapse>
      </div>
    </Paper>
  )
})
