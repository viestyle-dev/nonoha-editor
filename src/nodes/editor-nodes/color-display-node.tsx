"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useReactFlow,
  useHandleConnections,
  useNodesData,
} from "@xyflow/react"
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
  Typography,
} from "@mui/material"
import { css } from "@emotion/react"
import {
  GraphEndpoint,
  PortData,
  PortDataType,
  PortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { useThemeStore } from "@/src/stores/theme-store"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { NodeHandleLeft } from "@/src/components/node-handle"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { ExpandLess, ExpandMore } from "@mui/icons-material"
import { SignalLamp } from "@/src/components/signal-lamp"

type ColorFormat = "RGB" | "RGBA" | "ARGB" | "BGR" | "BGRA" | "RGBW"

const COLOR_FORMAT_INFO = {
  RGB: { components: 3, order: [0, 1, 2], labels: ["R", "G", "B"] },
  RGBA: { components: 4, order: [0, 1, 2, 3], labels: ["R", "G", "B", "A"] },
  ARGB: { components: 4, order: [3, 0, 1, 2], labels: ["A", "R", "G", "B"] },
  BGR: { components: 3, order: [2, 1, 0], labels: ["B", "G", "R"] },
  BGRA: { components: 4, order: [2, 1, 0, 3], labels: ["B", "G", "R", "A"] },
  RGBW: { components: 4, order: [0, 1, 2, 3], labels: ["R", "G", "B", "W"] },
}

const ColorDisplay = memo(
  (props: {
    graphEndpoint: GraphEndpoint | undefined
    targetIndex: number
    dataType: PortDataType
    colorFormat: ColorFormat
  }) => {
    const { graphEndpoint, targetIndex, dataType, colorFormat } = props

    const refTargetIndex = useRef(targetIndex)
    refTargetIndex.current = targetIndex

    const refDataType = useRef(dataType)
    refDataType.current = dataType

    const refColorFormat = useRef(colorFormat)
    refColorFormat.current = colorFormat

    // Handle connections
    const valuesConns = useHandleConnections({ type: "target", id: "values" })
    const valuesSourceData = useNodesData<BasicPortNode>(valuesConns[0]?.source)
    const valuesSourceDataRef = useRef(valuesSourceData)
    valuesSourceDataRef.current = valuesSourceData

    const [errorMessage, setErrorMessage] = useState<string | undefined>(
      undefined
    )
    const [colorValue, setColorValue] = useState<string>("#000000")
    const [componentValues, setComponentValues] = useState<number[]>([
      0, 0, 0, 0,
    ])
    const refCurrentPortValues = useRef<PortValue[] | undefined>(undefined)

    const [triggerCount, setTriggerCount] = useState(0)

    // Convert array values to hex color for preview
    const valuesToHex = useCallback(
      (values: number[], format: ColorFormat, isFloat: boolean): string => {
        const formatInfo = COLOR_FORMAT_INFO[format]
        const normalizedValues = isFloat ? values : values.map(v => v / 255)

        // Extract RGB components based on format
        let r = 0,
          g = 0,
          b = 0

        if (format === "RGB" || format === "RGBA" || format === "RGBW") {
          r = normalizedValues[0] || 0
          g = normalizedValues[1] || 0
          b = normalizedValues[2] || 0
        } else if (format === "BGR" || format === "BGRA") {
          r = normalizedValues[2] || 0
          g = normalizedValues[1] || 0
          b = normalizedValues[0] || 0
        } else if (format === "ARGB") {
          r = normalizedValues[1] || 0
          g = normalizedValues[2] || 0
          b = normalizedValues[3] || 0
        }

        // Apply alpha channel effect (darken)
        if (format === "RGBA" || format === "BGRA") {
          const alpha =
            normalizedValues[3] !== undefined ? normalizedValues[3] : 1
          r = r * alpha
          g = g * alpha
          b = b * alpha
        } else if (format === "ARGB") {
          const alpha =
            normalizedValues[0] !== undefined ? normalizedValues[0] : 1
          r = ~~(r * alpha)
          g = ~~(g * alpha)
          b = ~~(b * alpha)
        }

        // Apply white channel effect (brighten)
        if (format === "RGBW") {
          const white = normalizedValues[3] || 0
          // Additive mixing with normalization (FastLED/WLED approach)

          if (white > 0) {
            // Add white to all channels
            r = r + white
            g = g + white
            b = b + white

            // Normalize if any component exceeds 1.0
            // This preserves color ratios while preventing overflow
            const maxComponent = Math.max(r, g, b)
            if (maxComponent > 1) {
              r = r / maxComponent
              g = g / maxComponent
              b = b / maxComponent
            }
          }
        }

        const toHex = (n: number) => {
          const hex = Math.max(0, Math.min(255, ~~(n * 255))).toString(16)
          return hex.length === 1 ? "0" + hex : hex
        }

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`
      },
      []
    )

    // Update display with new data
    const updateDisplay = useCallback(
      (portValues: PortValue[]) => {
        const portValue = portValues[refTargetIndex.current]
        if (portValue === undefined) {
          setErrorMessage(
            `Target index out of range: port value count is ${portValues.length}`
          )
          setColorValue("#000000")
          setComponentValues([0, 0, 0, 0])
          return
        }

        const currentDataType = refDataType.current
        const currentFormat = refColorFormat.current
        const formatInfo = COLOR_FORMAT_INFO[currentFormat]

        // Validate data type
        if (portValue.dataType !== currentDataType) {
          setErrorMessage(
            `Data type mismatch: expected ${currentDataType}, got ${portValue.dataType}`
          )
          setColorValue("#000000")
          setComponentValues([0, 0, 0, 0])
          return
        }

        // Validate shape
        if (portValue.shape.length !== 2) {
          setErrorMessage("Expected 2D array (batch, components)")
          setColorValue("#000000")
          setComponentValues([0, 0, 0, 0])
          return
        }

        const batchSize = portValue.shape[0]
        const componentCount = portValue.shape[1]

        // Validate component count
        if (componentCount !== formatInfo.components) {
          setErrorMessage(
            `Component count mismatch: ${currentFormat} requires ${formatInfo.components} components, got ${componentCount}`
          )
          setColorValue("#000000")
          setComponentValues([0, 0, 0, 0])
          return
        }

        setErrorMessage(undefined)

        // Get the last batch item
        const lastItemStartIndex = (batchSize - 1) * componentCount
        const values: number[] = []

        // Extract values based on data type
        if (currentDataType === PortDataType.Float32) {
          const float32Array = portValue.array as Float32Array
          for (let i = 0; i < componentCount; i++) {
            values.push(float32Array[lastItemStartIndex + i])
          }
        } else if (currentDataType === PortDataType.Uint8) {
          const uint8Array = portValue.array as Uint8Array
          for (let i = 0; i < componentCount; i++) {
            values.push(uint8Array[lastItemStartIndex + i])
          }
        }

        setComponentValues(values)
        const hexColor = valuesToHex(
          values,
          currentFormat,
          currentDataType === PortDataType.Float32
        )
        setColorValue(hexColor)
      },
      [valuesToHex]
    )

    // Update when configuration changes
    useEffect(() => {
      if (refCurrentPortValues.current === undefined) {
        return
      }
      updateDisplay(refCurrentPortValues.current)
    }, [targetIndex, dataType, colorFormat, updateDisplay])

    // Fetch initial data
    useEffect(() => {
      const portName = valuesSourceData?.data.port.name
      if (!graphEndpoint || !portName) {
        return
      }

      graphEndpoint.fetchOutputValues(portName)
        .then(values => {
          refCurrentPortValues.current = values
          updateDisplay(values)
        })
        .catch(error => {
          console.error(error)
        })
    }, [valuesSourceData, graphEndpoint, updateDisplay])

    // Subscribe to output updates
    useEffect(() => {
      if (!graphEndpoint) {
        return
      }

      const onOutputCallback = (output: PortData) => {
        if (valuesSourceDataRef.current?.data.port.name !== output.portName) {
          return
        }
        refCurrentPortValues.current = output.values
        updateDisplay(output.values)

        setTriggerCount(prev => prev + 1)
      }

      graphEndpoint.addOutputCallback(onOutputCallback)
      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint, updateDisplay])

    const [{ colors }] = useThemeStore()

    const formatInfo = COLOR_FORMAT_INFO[colorFormat]
    const isFloat = dataType === PortDataType.Float32

    return (
      <>
        <div
          css={css({
            paddingLeft: 8,
            paddingBottom: 4,
          })}
        >
          <SignalLamp triggerCount={triggerCount} />
        </div>
        {errorMessage && (
          <Typography
            variant="caption"
            css={css({
              color: colors.error,
              padding: "0 8px 8px 8px",
              display: "block",
            })}
          >
            {errorMessage}
          </Typography>
        )}
        <div
          css={css({
            padding: "0 8px 8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          })}
        >
          {/* Color preview */}
          <div
            css={css({
              width: "100%",
              height: "60px",
              borderRadius: "4px",
              border: `1px solid ${colors.onSurfaceVariant}`,
              backgroundColor: colorValue,
            })}
          />

          {/* Component values */}
          <div
            css={css({
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))",
              gap: "4px",
              fontSize: "12px",
              fontFamily: "monospace",
            })}
          >
            {formatInfo.labels.map((label, index) => (
              <div
                key={index}
                css={css({
                  padding: "4px",
                  backgroundColor: colors.surface,
                  borderRadius: "2px",
                  textAlign: "center",
                })}
              >
                <div css={css({ color: colors.onSurfaceVariant })}>{label}</div>
                <div css={css({ fontWeight: 500 })}>
                  {isFloat
                    ? componentValues[index]?.toFixed(3) || "0.000"
                    : componentValues[index] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }
)

export type ColorDisplayNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    targetIndex?: number
    dataType?: PortDataType
    colorFormat?: ColorFormat
  }
}>

export const ColorDisplayNode = memo((props: NodeProps<ColorDisplayNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  const targetIndex = props.data.nodeData?.targetIndex ?? 0
  const dataType = props.data.nodeData?.dataType ?? PortDataType.Uint8
  const colorFormat = props.data.nodeData?.colorFormat ?? "RGB"

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<ColorDisplayNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as ColorDisplayNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
    },
    [props.id, setNodes]
  )

  const editorModelUpdater = props.data.editorModelUpdater

  // Initial data is now passed via props.data from page.tsx
  // No need to fetch from backend

  const applyNodeData = (
    targetIndex: number,
    dataType: PortDataType,
    colorFormat: ColorFormat
  ) => {
    updateNodeData({ targetIndex, dataType, colorFormat })
    const nodeId = props.id

    editorModelUpdater.patchNodeData(nodeId, {
      targetIndex,
      dataType,
      colorFormat,
    })
  }

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false)

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
        minWidth: "200px",
      })}
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
            align-items: flex-start;
          `}
        >
          <NodeHandleLeft id="values" label="values" />
        </div>
        <div
          css={css`
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            padding: 8px;
            min-width: 160px;
          `}
        />
      </div>

      <ColorDisplay
        graphEndpoint={props.data.graphEndpoint}
        targetIndex={targetIndex}
        dataType={dataType}
        colorFormat={colorFormat}
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
            padding: "8px",
            gap: "8px",
          })}
        >
          <TextField
            label="Target Index"
            type="number"
            size="small"
            value={targetIndex}
            onChange={event => {
              const value = parseInt(event.target.value)
              if (!isNaN(value) && value >= 0) {
                updateNodeData({ targetIndex: value })
              }
            }}
            onBlur={() => {
              applyNodeData(targetIndex, dataType, colorFormat)
            }}
            inputProps={{ min: 0 }}
          />
          <FormControl size="small">
            <InputLabel>Data Type</InputLabel>
            <Select
              label="Data Type"
              value={dataType}
              onChange={event => {
                updateNodeData({ dataType: event.target.value as PortDataType })
              }}
              onBlur={() => {
                applyNodeData(targetIndex, dataType, colorFormat)
              }}
            >
              <MenuItem value={PortDataType.Uint8}>uint8 (0-255)</MenuItem>
              <MenuItem value={PortDataType.Float32}>
                float32 (0.0-1.0)
              </MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Color Format</InputLabel>
            <Select
              label="Color Format"
              value={colorFormat}
              onChange={event => {
                updateNodeData({
                  colorFormat: event.target.value as ColorFormat,
                })
              }}
              onBlur={() => {
                applyNodeData(targetIndex, dataType, colorFormat)
              }}
            >
              <MenuItem value="RGB">RGB</MenuItem>
              <MenuItem value="RGBA">RGBA</MenuItem>
              <MenuItem value="ARGB">ARGB</MenuItem>
              <MenuItem value="BGR">BGR</MenuItem>
              <MenuItem value="BGRA">BGRA</MenuItem>
              <MenuItem value="RGBW">RGBW</MenuItem>
            </Select>
          </FormControl>
        </div>
      </Collapse>
    </Paper>
  )
})
