import { memo, useCallback, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useHandleConnections,
  useNodesData,
  useReactFlow,
} from "@xyflow/react"
import { Button, Divider, Paper, TextField } from "@mui/material"
import { css } from "@emotion/react"
import {
  PortDataType,
  GraphEndpoint,
  Int8PortValue,
  Int16PortValue,
  Int32PortValue,
  Int64PortValue,
  Uint8PortValue,
  Uint16PortValue,
  Uint32PortValue,
  Uint64PortValue,
  Float32PortValue,
  Float64PortValue,
  BoolPortValue,
  StringPortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleRight } from "@/src/components/node-handle"
import { enqueueSnackbar } from "notistack"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"

export type ValuesInputNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    inputValuesText?: string
  }
}>

const INIT_VALUES_INPUT_TEXT = `{
  "type": "f32",
  "shape": [2,5],
  "values": [0,1,2,3,4,5,6,7,8,9]
},{
  "type": "i8",
  "shape": [1],
  "values": [2]
}`

export const ValuesInputNode = memo((props: NodeProps<ValuesInputNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  const [detailsOpen, setDetailsOpen] = useState(false)
  const inputValuesText = props.data.nodeData?.inputValuesText ?? INIT_VALUES_INPUT_TEXT

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<ValuesInputNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as ValuesInputNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
    },
    [props.id, setNodes]
  )

  const valuesConns = useHandleConnections({
    type: "source",
    id: "values",
  })
  const valuesTargetsData = useNodesData<BasicPortNode>(
    valuesConns.map(conn => conn.target)
  )
  const valuesTargetsDataRef = useRef(valuesTargetsData)
  valuesTargetsDataRef.current = valuesTargetsData

  const editorModelUpdater = props.data.editorModelUpdater

  // Initial data is now passed via props.data from page.tsx
  // No need to fetch from backend

  const onClickSend = async () => {
    const graphEndpoint = props.data.graphEndpoint
    if (!graphEndpoint) {
      return
    }

    // let portData: PortData | undefined

    try {
      const inputValues: {
        type: string
        values: number[] | string[]
        shape: number[]
      }[] = JSON.parse(`[${inputValuesText}]`)

      if (inputValues.length === 0) {
        throw new Error("No values")
      }

      const portData = {
        portName: "",
        values: inputValues.map(value => {
          const size = value.shape.reduce((a, b) => a * b, 1)
          if (value.values.length !== size) {
            throw new Error(
              `Invalid shape for ${value.type}: expected ${value.values.length}, got   ${size}`
            )
          }
          switch (value.type) {
            case "i8":
              return {
                dataType: PortDataType.Int8,
                shape: value.shape,
                array: new Int8Array(value.values as number[]),
              } as Int8PortValue
            case "i16":
              return {
                dataType: PortDataType.Int16,
                shape: value.shape,
                array: new Int16Array(value.values as number[]),
              } as Int16PortValue
            case "i32":
              return {
                dataType: PortDataType.Int32,
                shape: value.shape,
                array: new Int32Array(value.values as number[]),
              } as Int32PortValue
            case "i64":
              return {
                dataType: PortDataType.Int64,
                shape: value.shape,
                array: new BigInt64Array(
                  (value.values as string[]).map(BigInt)
                ),
              } as Int64PortValue
            case "u8":
              return {
                dataType: PortDataType.Uint8,
                shape: value.shape,
                array: new Uint8Array(value.values as number[]),
              } as Uint8PortValue
            case "u16":
              return {
                dataType: PortDataType.Uint16,
                shape: value.shape,
                array: new Uint16Array(value.values as number[]),
              } as Uint16PortValue
            case "u32":
              return {
                dataType: PortDataType.Uint32,
                shape: value.shape,
                array: new Uint32Array(value.values as number[]),
              } as Uint32PortValue
            case "u64":
              return {
                dataType: PortDataType.Uint64,
                shape: value.shape,
                array: new BigUint64Array(
                  (value.values as string[]).map(BigInt)
                ),
              } as Uint64PortValue
            case "f32":
              return {
                dataType: PortDataType.Float32,
                shape: value.shape,
                array: new Float32Array(value.values as number[]),
              } as Float32PortValue
            case "f64":
              return {
                dataType: PortDataType.Float64,
                shape: value.shape,
                array: new Float64Array(value.values as number[]),
              } as Float64PortValue
            case "bool":
              return {
                dataType: PortDataType.Bool,
                shape: value.shape,
                array: new Uint8Array(value.values as number[]),
              } as BoolPortValue
            case "str":
              return {
                dataType: PortDataType.String,
                shape: value.shape,
                array: value.values as string[],
              } as StringPortValue

            default:
              throw new Error(`Unknown data type: ${value.type}`)
          }
        }),
      }

      valuesTargetsDataRef.current.forEach(target => {
        const portName = target.data.port.name
        portData.portName = portName
        graphEndpoint.dispatchInput(portData)
      })
    } catch (error) {
      enqueueSnackbar(`${error}`, { variant: "error" })
      return
    }
  }

  const saveInputValuesText = async (newInputValuesText: string) => {
    updateNodeData({ inputValuesText: newInputValuesText })
    const editorModelUrl = editorModelUpdater.editorModelUrl
    const nodeId = props.id

    try {
      const response = await fetch(
        `${editorModelUrl}?query=nodes.${nodeId}.data`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputValuesText: newInputValuesText,
          }),
        }
      )
      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }
    } catch (error) {
      console.error(error)
      enqueueSnackbar(`${error}`, { variant: "error" })
    }
  }

  const [titleEditing, setTitleEditing] = useState(false)
  const [textFieldFocused, setTextFieldFocused] = useState(false)

  return (
    <Paper
      css={css({
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
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
          css={css({
            flexGrow: 1,
          })}
        />
        <div
          css={css`
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          `}
        >
          <NodeHandleRight id="values" label="values" />
        </div>
      </div>
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          paddingLeft: 8,
          paddingRight: 8,
          paddingBottom: 8,
          minWidth: 160,
        })}
      >
        <Button variant="outlined" onClick={onClickSend}>
          Send
        </Button>
        <TextField
          css={css({
            marginTop: 8,
          })}
          className={textFieldFocused ? "nowheel" : ""}
          multiline
          size="small"
          slotProps={{
            input: {
              style: {
                fontSize: "0.75rem",
              },
            },
          }}
          maxRows={4}
          value={inputValuesText}
          onChange={event => {
            updateNodeData({ inputValuesText: event.target.value })
          }}
          onFocus={() => setTextFieldFocused(true)}
          onBlur={event => {
            setTextFieldFocused(false)
            saveInputValuesText(event.target.value)
          }}
        />
      </div>
    </Paper>
  )
})
