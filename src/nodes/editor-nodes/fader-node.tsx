import { memo, useCallback, useEffect, useRef, useState } from "react"
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
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  TextField,
  Typography,
} from "@mui/material"
import { css } from "@emotion/react"
import {
  PortDataType,
  GraphEndpoint,
  PortData,
  PortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleRight } from "@/src/components/node-handle"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { ExpandLess, ExpandMore } from "@mui/icons-material"

export type FaderNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    value?: number
    min?: number
    max?: number
    step?: number
    valueType?: PortDataType
  }
}>

export const FaderNode = memo((props: NodeProps<FaderNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  // Default values
  const value = props.data.nodeData?.value ?? 0
  const min = props.data.nodeData?.min ?? 0
  const max = props.data.nodeData?.max ?? 100
  const step = props.data.nodeData?.step ?? 1
  const valueType = props.data.nodeData?.valueType ?? PortDataType.Float32

  // Local state for slider value to prevent unnecessary re-renders
  const [localValue, setLocalValue] = useState(value)
  const isSliding = useRef(false)

  // Local state for text field values to allow intermediate input
  const [minText, setMinText] = useState(min.toString())
  const [maxText, setMaxText] = useState(max.toString())
  const [stepText, setStepText] = useState(step.toString())

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<FaderNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as FaderNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
    },
    [props.id, setNodes]
  )

  const valueConns = useHandleConnections({
    type: "source",
    id: "value",
  })
  const valueTargetsData = useNodesData<BasicPortNode>(
    valueConns.map(conn => conn.target)
  )
  const refValueTargetsData = useRef(valueTargetsData)
  refValueTargetsData.current = valueTargetsData

  const editorModelUpdater = props.data.editorModelUpdater

  // Initial data is now passed via props.data from page.tsx
  // No need to fetch from backend

  // Sync local value with prop value when not sliding
  useEffect(() => {
    if (!isSliding.current) {
      setLocalValue(value)
    }
  }, [value])

  // Sync text field values with props
  useEffect(() => {
    setMinText(min.toString())
  }, [min])

  useEffect(() => {
    setMaxText(max.toString())
  }, [max])

  useEffect(() => {
    setStepText(step.toString())
  }, [step])

  const applyNodeData = useCallback(
    (updates: Partial<NonNullable<FaderNode["data"]["nodeData"]>>) => {
      updateNodeData(updates)
      const nodeId = props.id

      editorModelUpdater.patchNodeData(nodeId, updates)
    },
    [props.id, updateNodeData, editorModelUpdater]
  )

  const sendValue = useCallback(
    (val: number) => {
      const graphEndpoint = props.data.graphEndpoint
      if (!graphEndpoint) {
        return
      }

      let portValue: PortValue | undefined

      switch (valueType) {
        case PortDataType.Int8:
          portValue = {
            dataType: PortDataType.Int8,
            shape: [1],
            array: new Int8Array([Math.round(val)]),
          }
          break
        case PortDataType.Uint8:
          portValue = {
            dataType: PortDataType.Uint8,
            shape: [1],
            array: new Uint8Array([Math.round(val)]),
          }
          break
        case PortDataType.Int32:
          portValue = {
            dataType: PortDataType.Int32,
            shape: [1],
            array: new Int32Array([Math.round(val)]),
          }
          break
        case PortDataType.Uint32:
          portValue = {
            dataType: PortDataType.Uint32,
            shape: [1],
            array: new Uint32Array([Math.round(val)]),
          }
          break
        case PortDataType.Int64:
          portValue = {
            dataType: PortDataType.Int64,
            shape: [1],
            array: new BigInt64Array([BigInt(Math.round(val))]),
          }
          break
        case PortDataType.Uint64:
          portValue = {
            dataType: PortDataType.Uint64,
            shape: [1],
            array: new BigUint64Array([BigInt(Math.round(val))]),
          }
          break
        case PortDataType.Float32:
          portValue = {
            dataType: PortDataType.Float32,
            shape: [1],
            array: new Float32Array([val]),
          }
          break
      }

      if (!portValue) {
        return
      }

      const portData: PortData = {
        portName: "",
        values: [portValue],
      }

      refValueTargetsData.current.forEach(target => {
        const portName = target.data.port.name
        portData.portName = portName
        graphEndpoint.dispatchInput(portData)
      })
    },
    [props.data.graphEndpoint, valueType]
  )

  const handleSliderChange = useCallback(
    (_: Event, newValue: number | number[]) => {
      const val = Array.isArray(newValue) ? newValue[0] : newValue
      setLocalValue(val)
      isSliding.current = true
      sendValue(val)
    },
    [sendValue]
  )

  const handleSliderChangeCommitted = useCallback(
    (
      _: Event | React.SyntheticEvent<Element, Event>,
      newValue: number | number[]
    ) => {
      const val = Array.isArray(newValue) ? newValue[0] : newValue
      isSliding.current = false
      applyNodeData({ value: val })
    },
    [applyNodeData]
  )

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
        
        <div css={css({ flexGrow: 1 })} />
        <div
          css={css`
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          `}
        >
          <NodeHandleRight id="value" label="value" />
        </div>
      </div>
      <div
        css={css`
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          padding-top: 0;
          padding-right: 16px;
          padding-left: 16px;
          padding-bottom: 8px;
          min-width: 200px;
        `}
      >
        <Typography
          variant="body2"
          css={css({ marginBottom: 8, color: colors.onSurfaceVariant })}
        >
          {localValue.toFixed(valueType === PortDataType.Float32 ? 2 : 0)}
        </Typography>
        <Slider
          value={localValue}
          min={min}
          max={max}
          step={step}
          onChange={handleSliderChange}
          onChangeCommitted={handleSliderChangeCommitted}
          sx={{
            color: colors.primary,
            "& .MuiSlider-thumb": {
              backgroundColor: colors.primary,
            },
            "& .MuiSlider-track": {
              backgroundColor: colors.primary,
            },
            "& .MuiSlider-rail": {
              backgroundColor: colors.onSurfaceVariant,
              opacity: 0.28,
            },
          }}
        />
      </div>
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
            gap: 12,
          })}
        >
          <TextField
            size="small"
            label="Min"
            value={minText}
            onChange={event => {
              setMinText(event.target.value)
            }}
            onBlur={event => {
              const newMin = parseFloat(event.target.value)
              if (!isNaN(newMin)) {
                updateNodeData({ min: newMin })
                applyNodeData({ min: newMin })
              } else {
                // Reset to valid value if invalid
                setMinText(min.toString())
              }
            }}
            autoComplete="off"
          />
          <TextField
            size="small"
            label="Max"
            value={maxText}
            onChange={event => {
              setMaxText(event.target.value)
            }}
            onBlur={event => {
              const newMax = parseFloat(event.target.value)
              if (!isNaN(newMax)) {
                updateNodeData({ max: newMax })
                applyNodeData({ max: newMax })
              } else {
                // Reset to valid value if invalid
                setMaxText(max.toString())
              }
            }}
            autoComplete="off"
          />
          <TextField
            size="small"
            label="Step"
            value={stepText}
            onChange={event => {
              setStepText(event.target.value)
            }}
            onBlur={event => {
              const newStep = parseFloat(event.target.value)
              if (!isNaN(newStep) && newStep > 0) {
                updateNodeData({ step: newStep })
                applyNodeData({ step: newStep })
              } else {
                // Reset to valid value if invalid
                setStepText(step.toString())
              }
            }}
            autoComplete="off"
          />
          <FormControl size="small">
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={valueType}
              onChange={event => {
                const newType = event.target.value as PortDataType
                updateNodeData({ valueType: newType })
              }}
              onBlur={() => {
                applyNodeData({ valueType })
              }}
            >
              <MenuItem value={PortDataType.Int8}>int8</MenuItem>
              <MenuItem value={PortDataType.Uint8}>uint8</MenuItem>
              <MenuItem value={PortDataType.Int32}>int32</MenuItem>
              <MenuItem value={PortDataType.Uint32}>uint32</MenuItem>
              <MenuItem value={PortDataType.Int64}>int64</MenuItem>
              <MenuItem value={PortDataType.Uint64}>uint64</MenuItem>
              <MenuItem value={PortDataType.Float32}>float32</MenuItem>
            </Select>
          </FormControl>
        </div>
      </Collapse>
    </Paper>
  )
})
