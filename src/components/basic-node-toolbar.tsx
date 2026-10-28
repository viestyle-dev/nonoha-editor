import { memo } from "react"
import { useThemeStore } from "../stores/theme-store"
import { NodeToolbar, useReactFlow } from "@xyflow/react"
import { css } from "@emotion/react"
import { alpha, IconButton } from "@mui/material"
import { Clear } from "@mui/icons-material"

interface BasicNodeToolbarProps {
  nodeId: string
  isVisible?: boolean
}

export const BasicNodeToolbar = memo((props: BasicNodeToolbarProps) => {
  const { nodeId, isVisible } = props
  const [{ colors }] = useThemeStore()

  const { deleteElements } = useReactFlow()

  return (
    <NodeToolbar isVisible={isVisible} offset={8} align="end">
      <div
        css={css({
          backgroundColor: alpha(colors.surfaceContainerLow, 0.75),
          padding: 4,
        })}
      >
        <IconButton
          color="error"
          size="small"
          css={css({
            fontSize: 16,
          })}
          onClick={() => {
            deleteElements({ nodes: [{ id: nodeId }] })
          }}
        >
          <Clear fontSize="inherit" />
        </IconButton>
      </div>
    </NodeToolbar>
  )
})
