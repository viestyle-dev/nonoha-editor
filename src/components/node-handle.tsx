import { css } from "@emotion/react"
import { Typography } from "@mui/material"
import { Handle, Position } from "@xyflow/react"
import { forwardRef, MouseEvent, ReactNode } from "react"

import { portRing, useBreatheDelay } from "@/src/components/breath"
import { useThemeStore } from "@/src/stores/theme-store"

/** Height of one handle row, inputs and outputs alike. */
const ROW_HEIGHT = 20
const HANDLE_SIZE = 16

const row = css({
  display: "flex",
  flexDirection: "row",
  position: "relative",
  alignItems: "center",
  minWidth: 8,
  height: ROW_HEIGHT,
})
const leftLabel = css({ paddingLeft: 8, whiteSpace: "nowrap" })
const rightLabel = css({ paddingRight: 8, whiteSpace: "nowrap" })
const clickableLabel = css({
  cursor: "pointer",
  borderRadius: 4,
  "&:hover": { textDecoration: "underline dotted" },
})

export interface NodeHandleLeftProps {
  id?: string
  label?: string
  /** The accepted type's color; the theme's neutral color when it accepts several or any. */
  handleColor?: string
  /** Handle size in px (16; property ports use a smaller one). */
  size?: number
}

export const NodeHandleLeft = forwardRef<HTMLDivElement, NodeHandleLeftProps>(
  // `rest`: what a wrapping Tooltip passes (its listeners and aria attributes)
  function NodeHandleLeft({ id, label, handleColor, size = HANDLE_SIZE, ...rest }, ref) {
    const [{ colors }] = useThemeStore()
    return (
      <div {...rest} ref={ref} css={row}>
        <Handle
          style={{ width: size, height: size, background: handleColor ?? colors.outline }}
          id={id}
          type="target"
          position={Position.Left}
        />
        {label && (
          <Typography variant="caption" css={leftLabel}>
            {label}
          </Typography>
        )}
      </div>
    )
  },
)

export interface NodeHandleRightProps {
  id?: string
  label: string
  handleColor?: string
  /** Ring color while the inspector reports this port's activity; undefined = no ring. */
  glow?: string
  /** Values flow through the port now: the ring breathes. */
  flowing?: boolean
  /** Shown before the label (e.g. a rate badge). */
  badge?: ReactNode
  /** Makes the label clickable (e.g. to peek at the value). */
  onLabelClick?: (event: MouseEvent<HTMLElement>) => void
}

export const NodeHandleRight = forwardRef<HTMLDivElement, NodeHandleRightProps>(
  // `rest`: what a wrapping Tooltip passes (its listeners and aria attributes)
  function NodeHandleRight({ id, label, handleColor, glow, flowing = false, badge, onLabelClick, ...rest }, ref) {
    const breatheDelay = useBreatheDelay(flowing)
    return (
      <div {...rest} ref={ref} css={row}>
        {badge}
        <Typography
          variant="caption"
          className={onLabelClick ? "nodrag" : undefined}
          css={[rightLabel, onLabelClick && clickableLabel]}
          onClick={onLabelClick}
        >
          {label}
        </Typography>
        <Handle
          style={{
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            background: handleColor,
            ...(glow
              ? ({ "--port-glow": glow, "--breathe-delay": breatheDelay } as Record<string, string | undefined>)
              : null),
          }}
          css={glow ? portRing : undefined}
          data-flowing={glow && flowing ? "" : undefined}
          id={id}
          type="source"
          position={Position.Right}
        />
      </div>
    )
  },
)
