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
  Divider,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material"
import { css } from "@emotion/react"
import {
  PortDataType,
  GraphEndpoint,
  PortData,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleRight } from "@/src/components/node-handle"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"

export type TriggerNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    boolValue?: boolean
  }
}>

export const TriggerNode = memo((props: NodeProps<TriggerNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  const boolValue = props.data.nodeData?.boolValue ?? true

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<TriggerNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as TriggerNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
    },
    [props.id, setNodes]
  )

  // ---
  const triggerConns = useHandleConnections({
    type: "source",
    id: "trigger",
  })
  const triggerTargetsData = useNodesData<BasicPortNode>(
    triggerConns.map(conn => conn.target)
  )
  const triggerTargetsDataRef = useRef(triggerTargetsData)
  triggerTargetsDataRef.current = triggerTargetsData
  // ---
  const editorModelUpdater = props.data.editorModelUpdater

  // Initial data is now passed via props.data from page.tsx
  // No need to fetch from backend

  const applyNodeData = (boolValue: boolean): void => {
    updateNodeData({ boolValue })
    const nodeId = props.id
    editorModelUpdater.patchNodeData(nodeId, {
      boolValue,
    })
  }

  const sendValue = () => {
    const graphEndpoint = props.data.graphEndpoint
    if (!graphEndpoint) {
      return
    }

    const portData: PortData = {
      portName: "",
      values: [
        {
          dataType: PortDataType.Bool,
          shape: [1],
          array: new Uint8Array([boolValue ? 1 : 0]),
        },
      ],
    }

    triggerTargetsDataRef.current.forEach(target => {
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
        background: colors.surfaceContainerHighest,
        color: colors.onSurface,
        outlineOffset: "4px",
        width: 160,
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
        css={css({
          display: "flex",
          flexDirection: "row",
        })}
      >
        <div css={css({ flexGrow: 1 })} />
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          })}
        >
          <NodeHandleRight id="trigger" label="trigger" />
        </div>
      </div>
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          padding: 8,
        })}
      >
        <Button variant="outlined" onClick={sendValue}>
          Trigger
        </Button>
        <ToggleButtonGroup
          exclusive
          value={boolValue}
          onChange={(event, value) => {
            // nullの場合は前回の値を維持
            if (value !== null) {
              applyNodeData(value)
            }
          }}
          size="small"
          css={css({
            marginTop: 8,
            alignSelf: "center",
          })}
        >
          <ToggleButton value={true}>True</ToggleButton>
          <ToggleButton value={false}>False</ToggleButton>
        </ToggleButtonGroup>
      </div>
    </Paper>
  )
})
