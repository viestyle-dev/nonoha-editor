import { css } from "@emotion/react"
import { Typography } from "@mui/material"
import { Handle, Position, useHandleConnections } from "@xyflow/react"
import { forwardRef } from "react"

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

export interface NodeHandleRightProps {
  id?: string
  label: string
  handleColor?: string
}

export const NodeHandleRight = forwardRef<HTMLDivElement, NodeHandleRightProps>(
  function NodeHandleRight(props, ref) {
    return (
      <div
        {...props}
        ref={ref}
        css={css`
          display: flex;
          flex-direction: row;
          position: relative;
          align-items: center;
        `}
      >
        <Typography sx={{ pr: 1 }} variant="caption">
          {props.label}
        </Typography>
        <Handle
          style={{
            width: "16px",
            height: "16px",
            background: props.handleColor,
          }}
          id={props.id}
          type="source"
          position={Position.Right}
        />
      </div>
    )
  }
)
