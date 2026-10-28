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
  PortData,
  PortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleRight } from "@/src/components/node-handle"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"

export type StringInputNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    inputValue?: string
  }
}>

export const StringInputNode = memo((props: NodeProps<StringInputNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  const inputValue = props.data.nodeData?.inputValue ?? ""

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<StringInputNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as StringInputNode["data"]).nodeData, ...newNodeData },
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

  const applyNodeData = (inputValue: string) => {
    updateNodeData({ inputValue })
    const nodeId = props.id

    editorModelUpdater.patchNodeData(nodeId, {
      inputValue,
    })
  }

  const sendValue = () => {
    const graphEndpoint = props.data.graphEndpoint
    if (!graphEndpoint) {
      return
    }

    const portValue: PortValue = {
      dataType: PortDataType.String,
      shape: [1],
      array: [inputValue],
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
            applyNodeData(inputValue)
          }}
          autoComplete="off"
          multiline
          minRows={1}
        />
      </div>
    </Paper>
  )
})
