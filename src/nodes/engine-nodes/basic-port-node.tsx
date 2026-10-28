import { alpha, Paper, Tooltip, Typography } from "@mui/material"
import { NodeProps, Node, Handle, Position } from "@xyflow/react"
import { memo, useState } from "react"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"
import { hexFromArgb } from "@material/material-color-utilities"
import { EditableTypography } from "@/src/components/editable-typography"
import { getNodeType } from "@/src/stores/node-flow-store"
import {
  getHctFromPortValueType,
  useNodeFlowColorsStore,
} from "@/src/stores/node-flow-colors-store"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"

export type BasicPortNode = Node<{
  label: string
  port: {
    name: string
    values: {
      type: string
    }[]
  }
  graphEditDisabled: boolean
}>

export const BasicPortNode = memo((props: NodeProps<BasicPortNode>) => {
  const [{ colors }] = useThemeStore()

  const [flowColorsState] = useNodeFlowColorsStore()

  const valuesString = props.data.port.values
    .map(value => value.type)
    .join(", ")

  const dataTypeFirst = props.data.port.values[0].type
  const dataTypeColor = hexFromArgb(
    getHctFromPortValueType(dataTypeFirst, flowColorsState.pallet).toInt()
  )

  const [titleEditing, setTitleEditing] = useState(false)

  const nodeId = props.id
  const nodeType = getNodeType(nodeId)

  return (
    <Paper
      css={css({
        borderRadius: 32,
        width: 64,
        height: 64,
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
        css={css({
          position: "absolute",
          top: -24,
          backgroundColor: alpha(colors.surfaceContainerLow, 0.75),
          padding: "4px",
          left: "50%",
          transform: "translateX(-50%)",
        })}
      >
        <EditableTypography
          editing={titleEditing}
          onEditingChange={editing => {
            setTitleEditing(editing)
          }}
          text={props.data.label}
          fontSize={12}
        />
      </div>
      <div
        css={css({
          position: "absolute",
          bottom: -16,
          backgroundColor: alpha(colors.surfaceContainerLow, 0.75),
          padding: "4px",
          left: "50%",
          transform: "translateX(-50%)",
          color: colors.onSurfaceVariant,
          fontSize: 12,
          whiteSpace: "nowrap",
          overflow: "hidden",
          maxWidth: "160px",
        })}
      >
        <Tooltip title={`[${valuesString}]`}>
          <Typography
            css={css({
              color: colors.onSurfaceVariant,
              fontSize: "inherit",
              overflow: "hidden",
              textOverflow: "ellipsis",
            })}
          >
            [{valuesString}]
          </Typography>
        </Tooltip>
      </div>
      <div
        className="drag-handle"
        css={css({
          position: "absolute",
          top: 0,
          left: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        })}
      >
        <Typography
          variant="caption"
          css={css({
            color: colors.onSurfaceVariant,
          })}
        >
          {nodeType == "input" && "IN"}
          {nodeType == "output" && "OUT"}
        </Typography>

        <Handle
          style={{
            width: "16px",
            height: "16px",
            background: dataTypeColor,
          }}
          type="target"
          position={Position.Left}
        />
        <Handle
          style={{
            width: "16px",
            height: "16px",
            background: dataTypeColor,
          }}
          type="source"
          position={Position.Right}
        />
      </div>
    </Paper>
  )
})
