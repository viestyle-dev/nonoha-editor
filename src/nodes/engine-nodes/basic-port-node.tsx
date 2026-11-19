import { alpha, Paper, Tooltip, Typography } from "@mui/material"
import { NodeProps, Node, Handle, Position, useStore } from "@xyflow/react"
import { memo, MouseEvent, useCallback, useMemo, useState } from "react"
import type { InspectorPortRef } from "nonoha-client-js"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"
import { hexFromArgb } from "@material/material-color-utilities"
import { EditableTypography } from "@/src/components/editable-typography"
import { getNodeType } from "@/src/stores/node-flow-store"
import { useNodeFlowColorsStore } from "@/src/stores/node-flow-colors-store"
import { getHctFromPortValueType } from "@/src/lib/graph/port-colors"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { portRing } from "@/src/components/port-ring"
import { useInspectorLive, usePortFlowing, usePortRateText } from "@/src/inspector/inspector-store"
import { LiveLines, zoomedInSelector } from "@/src/inspector/activity-output-handle"
import { PeekPopover } from "@/src/inspector/peek-popover"

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

  // Inspector: the graph's own port (node "") shows a ring while values flow;
  // the type label shows live statistics and opens a peek on click.
  const live = useInspectorLive() && (nodeType === "input" || nodeType === "output")
  const portName = props.data.port.name
  const portRef = useMemo<InspectorPortRef>(
    () => ({ node: "", dir: nodeType === "input" ? "in" : "out", port: portName }),
    [nodeType, portName],
  )
  // Each re-renders only when what it shows changes (not on every activity row)
  const flowing = usePortFlowing(live ? portRef : null)
  const zoomedIn = useStore(zoomedInSelector)
  const rateText = usePortRateText(live && zoomedIn ? portRef : null)
  const [peekAnchor, setPeekAnchor] = useState<HTMLElement | null>(null)
  const openPeek = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setPeekAnchor(event.currentTarget)
  }, [])
  const closePeek = useCallback(() => setPeekAnchor(null), [])

  return (
    <Paper
      css={[
        css({
          borderRadius: 32,
          width: 64,
          height: 64,
          position: "relative",
          background: colors.surfaceContainerHighest,
          color: colors.onSurface,
          outlineOffset: "4px",
        }),
        live && portRing,
      ]}
      data-flowing={flowing ? "" : undefined}
      style={{
        outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
        ...(live ? ({ "--port-glow": alpha(dataTypeColor, 0.45) } as Record<string, string>) : null),
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
        <Tooltip
          title={
            <span style={{ whiteSpace: "pre-line" }}>
              {`[${valuesString}]`}
              {live && <LiveLines portRef={portRef} />}
              {live && "\nClick to peek"}
            </span>
          }
          disableInteractive
        >
          <Typography
            className={live ? "nodrag" : undefined}
            onClick={live ? openPeek : undefined}
            css={css({
              color: colors.onSurfaceVariant,
              fontSize: "inherit",
              overflow: "hidden",
              textOverflow: "ellipsis",
              cursor: live ? "pointer" : undefined,
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
        {live && zoomedIn && (
          // Holds its line while values stop and start, so "OUT" does not move
          <Typography
            css={css({
              fontSize: 10,
              lineHeight: "12px",
              height: 12,
              color: colors.onSurfaceVariant,
              fontVariantNumeric: "tabular-nums",
            })}
          >
            {rateText && `${rateText} Hz`}
          </Typography>
        )}

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
      {peekAnchor && <PeekPopover anchorEl={peekAnchor} portRef={portRef} onClose={closePeek} />}
    </Paper>
  )
})
