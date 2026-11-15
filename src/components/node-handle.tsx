import { css, keyframes } from "@emotion/react"
import { Typography } from "@mui/material"
import { Handle, Position, useHandleConnections } from "@xyflow/react"
import { forwardRef, MouseEvent, ReactNode } from "react"

export interface NodeHandleLeftProps {
  id?: string
  label?: string
  handleColor?: string
  size?: number
}

export const NodeHandleLeft = forwardRef<HTMLDivElement, NodeHandleLeftProps>(
  function NodeHandleLeft(props, ref) {
    const connections = useHandleConnections({ type: "target", id: props.id })
    const handleSize = props.size ?? 16
    return (
      <div
        ref={ref}
        {...props}
        css={css({
          display: "flex",
          flexDirection: "row",
          position: "relative",
          alignItems: "center",
          minWidth: 8,
          height: handleSize,
        })}
      >
        <Handle
          style={{
            width: `${handleSize}px`,
            height: `${handleSize}px`,
            background: props.handleColor,
          }}
          id={props.id}
          type="target"
          position={Position.Left}
        />
        {props.label && (
          <Typography sx={{ pl: 1 }} variant="caption">
            {props.label}
          </Typography>
        )}
      </div>
    )
  }
)

// Soft ring that breathes while values flow through the port.
const breathe = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px var(--port-glow); }
  50% { box-shadow: 0 0 0 5px var(--port-glow); }
`

/** Breathing ring for anything carrying `--port-glow` (handles, port nodes). */
export const flowingGlow = css({
  animation: `${breathe} 1.6s ease-in-out infinite`,
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
    boxShadow: "0 0 0 3px var(--port-glow)",
  },
})

const clickableLabel = css({
  cursor: "pointer",
  borderRadius: 4,
  "&:hover": { textDecoration: "underline dotted" },
})

export interface NodeHandleRightProps {
  id?: string
  label: string
  handleColor?: string
  /** Glow color while values flow (inspector activity); undefined = no glow. */
  glow?: string
  /** Shown before the label (e.g. a rate badge). */
  badge?: ReactNode
  /** Makes the label clickable (e.g. to peek at the value). */
  onLabelClick?: (event: MouseEvent<HTMLElement>) => void
}

export const NodeHandleRight = forwardRef<HTMLDivElement, NodeHandleRightProps>(
  function NodeHandleRight({ id, label, handleColor, glow, badge, onLabelClick, ...rest }, ref) {
    return (
      <div
        {...rest}
        ref={ref}
        css={css`
          display: flex;
          flex-direction: row;
          position: relative;
          align-items: center;
        `}
      >
        {badge}
        <Typography
          sx={{ pr: 1 }}
          variant="caption"
          className={onLabelClick ? "nodrag" : undefined}
          css={onLabelClick ? clickableLabel : undefined}
          onClick={onLabelClick}
        >
          {label}
        </Typography>
        <Handle
          style={{
            width: "16px",
            height: "16px",
            background: handleColor,
            ...(glow ? ({ "--port-glow": glow } as Record<string, string>) : null),
          }}
          css={glow ? flowingGlow : undefined}
          id={id}
          type="source"
          position={Position.Right}
        />
      </div>
    )
  }
)
