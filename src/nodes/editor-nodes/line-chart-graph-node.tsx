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
import { Button, Collapse, Divider, FormControlLabel, Paper, Switch, TextField } from "@mui/material"
import { NodeHandleLeft } from "@/src/components/node-handle"
import dynamic from "next/dynamic"
import { LineChartPlotData } from "@/src/components/line-chart-graph"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { ExpandLess, ExpandMore } from "@mui/icons-material"
import { enqueueSnackbar } from "notistack"
const LineChartGraph = dynamic(
  () => import("@/src/components/line-chart-graph"),
  {
    ssr: false,
  }
)

const GraphWrapper = memo(
  ({
    graphEndpoint,
    recording,
    graphWidth = 480,
    graphHeight = 320,
    xMin,
    xMax,
    yMin,
    yMax,
  }: {
    graphEndpoint: GraphEndpoint | undefined
    recording: boolean
    graphWidth?: number
    graphHeight?: number
    xMin?: number
    xMax?: number
    yMin?: number
    yMax?: number
  }) => {
    const [plotData, setPlotData] = useState<LineChartPlotData>({
      x: [],
      traces: [],
    })

    const refXLabels = useRef<Float32Array>()

    const refRecording = useRef(recording)
    refRecording.current = recording

    // ---
    const tracesConns = useHandleConnections({
      type: "target",
      id: "traces",
    })
    const tracesSourcesData = useNodesData<BasicPortNode>(
      tracesConns[0]?.source
    )
    const refTracesSourcesData = useRef(tracesSourcesData)
    refTracesSourcesData.current = tracesSourcesData
    // ---
    const xLabelsConns = useHandleConnections({
      type: "target",
      id: "xLabels",
    })
    const xLabelsSourcesData = useNodesData<BasicPortNode>(
      xLabelsConns[0]?.source
    )
    const refXLabelsSourcesData = useRef(xLabelsSourcesData)
    refXLabelsSourcesData.current = xLabelsSourcesData
    // ---

    const [{ colors }] = useThemeStore()

    const [errorMessage, setErrorMessage] = useState<string | undefined>(
      undefined
    )


    const onTracesCallback = (values: PortValue[]) => {
      if (!refRecording.current) {
        return
      }

      const traces: LineChartPlotData["traces"] = []

      for (let i = 0; i < values.length; i++) {
        const value = values[i]
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

        traces.push(value.array.slice(-value.shape[1]))
      }

      setPlotData(() => {
        return {
          x: refXLabels.current,
          traces: traces,
        }
      })

      setErrorMessage(undefined)
    }

    const onXLabelsCallback = (values: PortValue[]) => {
      const value = values[0]
      if (value.shape.length !== 2) {
        setErrorMessage(
          `Invalid shape. Expected 2D array, got ${value.shape.length}D`
        )
        return
      }
      if (value.dataType !== PortDataType.Float32) {
        setErrorMessage(`Invalid data type, got ${value.dataType}`)
        return
      }

      const xLabels = value.array.slice(-value.array.length)
      refXLabels.current = xLabels
    }

    useEffect(() => {
      const portName = xLabelsSourcesData?.data?.port.name
      if (!graphEndpoint || !portName) {
        return
      }

      graphEndpoint.fetchOutputValues(portName)
        .then(values => {
          // console.log("xLabels", values)
          onXLabelsCallback(values)
        })
        .catch(error => {
          console.error(error)
        })
    }, [graphEndpoint, xLabelsSourcesData])

    useEffect(() => {
      if (!graphEndpoint) {
        return
      }

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
    }, [graphEndpoint])

    return (
      <div style={{ width: graphWidth, height: graphHeight }}>
        <LineChartGraph
          style={{ width: graphWidth, height: graphHeight }}
          plotData={plotData}
          graphWidth={graphWidth}
          graphHeight={graphHeight}
          xMin={xMin}
          xMax={xMax}
          yMin={yMin}
          yMax={yMax}
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

export type LineChartGraphNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    graphWidth?: number
    graphHeight?: number
    xMin?: number
    xMax?: number
    yMin?: number
    yMax?: number
  }
}>

export const LineChartGraphNode = memo(
  (props: NodeProps<LineChartGraphNode>) => {
    const { setNodes } = useReactFlow()
    const [{ colors }] = useThemeStore()

    const [graphWidth, setGraphWidth] = useState(props.data.nodeData?.graphWidth ?? 480)
    const [graphHeight, setGraphHeight] = useState(props.data.nodeData?.graphHeight ?? 320)
    const [xMin, setXMin] = useState(props.data.nodeData?.xMin ?? undefined)
    const [xMax, setXMax] = useState(props.data.nodeData?.xMax ?? undefined)
    const [yMin, setYMin] = useState(props.data.nodeData?.yMin ?? undefined)
    const [yMax, setYMax] = useState(props.data.nodeData?.yMax ?? undefined)

    const [graphWidthInput, setGraphWidthInput] = useState((props.data.nodeData?.graphWidth ?? 480).toString())
    const [graphHeightInput, setGraphHeightInput] = useState((props.data.nodeData?.graphHeight ?? 320).toString())
    const [xMinInput, setXMinInput] = useState(props.data.nodeData?.xMin?.toString() ?? "")
    const [xMaxInput, setXMaxInput] = useState(props.data.nodeData?.xMax?.toString() ?? "")
    const [yMinInput, setYMinInput] = useState(props.data.nodeData?.yMin?.toString() ?? "")
    const [yMaxInput, setYMaxInput] = useState(props.data.nodeData?.yMax?.toString() ?? "")

    const updateNodeData = useCallback((newNodeData: Partial<NonNullable<LineChartGraphNode['data']['nodeData']>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as LineChartGraphNode["data"]).nodeData, ...newNodeData },
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
      if (newNodeData.xMin !== undefined) {
        setXMin(newNodeData.xMin)
      }
      if (newNodeData.xMax !== undefined) {
        setXMax(newNodeData.xMax)
      }
      if (newNodeData.yMin !== undefined) {
        setYMin(newNodeData.yMin)
      }
      if (newNodeData.yMax !== undefined) {
        setYMax(newNodeData.yMax)
      }
    }, [props.id, setNodes])

    const [isRecording, setIsRecording] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)

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
      props.data.nodeData?.xMin,
      props.data.nodeData?.xMax,
      props.data.nodeData?.yMin,
      props.data.nodeData?.yMax,
    ])

    const applySettings = async () => {
      const width = Number(graphWidthInput)
      const height = Number(graphHeightInput)
      const xMinVal = xMinInput ? Number(xMinInput) : undefined
      const xMaxVal = xMaxInput ? Number(xMaxInput) : undefined
      const yMinVal = yMinInput ? Number(yMinInput) : undefined
      const yMaxVal = yMaxInput ? Number(yMaxInput) : undefined

      if (isNaN(width) || isNaN(height)) {
        enqueueSnackbar("Invalid graph size", { variant: "error" })
        return
      }

      if (width <= 0 || height <= 0) {
        enqueueSnackbar("Graph size must be positive", { variant: "error" })
        return
      }

      if ((xMinVal !== undefined && xMaxVal !== undefined && xMinVal >= xMaxVal) ||
          (yMinVal !== undefined && yMaxVal !== undefined && yMinVal >= yMaxVal)) {
        enqueueSnackbar("Min value must be less than Max value", { variant: "error" })
        return
      }

      const updates = {
        graphWidth: width,
        graphHeight: height,
        xMin: xMinVal,
        xMax: xMaxVal,
        yMin: yMinVal,
        yMax: yMaxVal,
      }

      updateNodeData(updates)
      editorModelUpdater.patchNodeData(props.id, updates)
      setYMin(yMinVal)
      setYMax(yMaxVal)
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
            // backgroundColor: surfaceContainerHighColor,
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
            <NodeHandleLeft id="xLabels" label="xLabels" />
            <NodeHandleLeft id="traces" label="traces" />
          </div>
        </div>
        <div
          css={css`
            display: flex;
            flex-direction: column;
            padding: 8px;
          `}
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
          <GraphWrapper
            graphEndpoint={props.data.graphEndpoint}
            recording={isRecording}
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            xMin={xMin}
            xMax={xMax}
            yMin={yMin}
            yMax={yMax}
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
                  label="X Min"
                  size="small"
                  value={xMinInput}
                  onChange={event => {
                    setXMinInput(event.target.value)
                  }}
                  css={css({
                    flexGrow: 1,
                  })}
                />
                <TextField
                  label="X Max"
                  size="small"
                  value={xMaxInput}
                  onChange={event => {
                    setXMaxInput(event.target.value)
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
                  label="Y Min"
                  size="small"
                  placeholder="auto"
                  value={yMinInput}
                  onChange={event => {
                    setYMinInput(event.target.value)
                  }}
                  css={css({
                    flexGrow: 1,
                  })}
                />
                <TextField
                  label="Y Max"
                  size="small"
                  placeholder="auto"
                  value={yMaxInput}
                  onChange={event => {
                    setYMaxInput(event.target.value)
                  }}
                  css={css({
                    flexGrow: 1,
                  })}
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
  }
)
