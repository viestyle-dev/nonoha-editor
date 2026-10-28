import { memo, useCallback, useRef, useState } from "react"
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
  IconButton,
  Input,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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

export type NumberInputNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    inputValue?: string
    inputValueType?: PortDataType
  }
}>

export const NumberInputNode = memo((props: NodeProps<NumberInputNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  const inputValue = props.data.nodeData?.inputValue ?? "0"
  const inputValueType = props.data.nodeData?.inputValueType ?? PortDataType.Int8

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<NumberInputNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as NumberInputNode["data"]).nodeData, ...newNodeData },
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

  const applyNodeData = (inputValue: string, inputValueType: PortDataType) => {
    updateNodeData({ inputValue, inputValueType })
    const nodeId = props.id

    editorModelUpdater.patchNodeData(nodeId, {
      inputValue,
      inputValueType,
    })
  }

  const sendValue = () => {
    const graphEndpoint = props.data.graphEndpoint
    if (!graphEndpoint) {
      return
    }

    let portValue: PortValue | undefined

    switch (inputValueType) {
      case PortDataType.Int8:
        portValue = {
          dataType: PortDataType.Int8,
          shape: [1],
          array: new Int8Array([parseInt(inputValue)]),
        }
        break
      case PortDataType.Int16:
        portValue = {
          dataType: PortDataType.Int16,
          shape: [1],
          array: new Int16Array([parseInt(inputValue)]),
        }
        break
      case PortDataType.Int32:
        portValue = {
          dataType: PortDataType.Int32,
          shape: [1],
          array: new Int32Array([parseInt(inputValue)]),
        }
        break
      case PortDataType.Int64:
        portValue = {
          dataType: PortDataType.Int64,
          shape: [1],
          array: new BigInt64Array([BigInt(inputValue)]),
        }
        break
      case PortDataType.Uint8:
        portValue = {
          dataType: PortDataType.Uint8,
          shape: [1],
          array: new Uint8Array([parseInt(inputValue)]),
        }
        break
      case PortDataType.Uint16:
        portValue = {
          dataType: PortDataType.Uint16,
          shape: [1],
          array: new Uint16Array([parseInt(inputValue)]),
        }
        break
      case PortDataType.Uint32:
        portValue = {
          dataType: PortDataType.Uint32,
          shape: [1],
          array: new Uint32Array([parseInt(inputValue)]),
        }
        break
      case PortDataType.Uint64:
        portValue = {
          dataType: PortDataType.Uint64,
          shape: [1],
          array: new BigUint64Array([BigInt(inputValue)]),
        }
        break
      case PortDataType.Float32:
        portValue = {
          dataType: PortDataType.Float32,
          shape: [1],
          array: new Float32Array([parseFloat(inputValue)]),
        }
        break
      case PortDataType.Float64:
        portValue = {
          dataType: PortDataType.Float64,
          shape: [1],
          array: new Float64Array([parseFloat(inputValue)]),
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
            flex-grow: 1;
            padding: 8px;
            min-width: 160px;
          `}
        ></div>
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
          padding: 8px;
        `}
      >
        <Button variant="outlined" onClick={sendValue}>
          Send
        </Button>

        <TextField
          css={css({
            marginTop: 8,
          })}
          size="small"
          value={inputValue}
          onChange={event => {
            updateNodeData({ inputValue: event.target.value })
          }}
          onBlur={() => {
            applyNodeData(inputValue, inputValueType)
          }}
          autoComplete="off"
        ></TextField>
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
            flexGrow: 1,
            padding: 8,
          })}
        >
          <FormControl
            size="small"
            css={css({
              marginTop: 16,
            })}
          >
            <InputLabel>Type</InputLabel>
            <Select
              label="Type"
              value={inputValueType}
              onChange={event => {
                updateNodeData({ inputValueType: event.target.value as PortDataType })
              }}
              onBlur={() => {
                applyNodeData(inputValue, inputValueType)
              }}
            >
              <MenuItem value={PortDataType.Int8}>int8</MenuItem>
              <MenuItem value={PortDataType.Int16}>int16</MenuItem>
              <MenuItem value={PortDataType.Int32}>int32</MenuItem>
              <MenuItem value={PortDataType.Int64}>int64</MenuItem>
              <MenuItem value={PortDataType.Uint8}>uint8</MenuItem>
              <MenuItem value={PortDataType.Uint16}>uint16</MenuItem>
              <MenuItem value={PortDataType.Uint32}>uint32</MenuItem>
              <MenuItem value={PortDataType.Uint64}>uint64</MenuItem>
              <MenuItem value={PortDataType.Float32}>float32</MenuItem>
              <MenuItem value={PortDataType.Float64}>float64</MenuItem>
            </Select>
          </FormControl>
        </div>
      </Collapse>
    </Paper>
  )
})
