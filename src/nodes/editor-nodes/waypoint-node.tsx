"use client"
import { Node, NodeProps, useStore } from "@xyflow/react"
import { memo, useCallback, useState } from "react"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"
import { useGraphSessionStore } from "@/src/stores/graph-session-store"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { WaypointContextMenu } from "@/src/components/waypoint-context-menu"

export type WaypointNode = Node<Record<string, never>>

/** Waypoint visual size in pixels. Used for centering edge paths. */
export const WAYPOINT_SIZE = 24

const containerStyle = css({
  width: WAYPOINT_SIZE,
  height: WAYPOINT_SIZE,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 500,
  cursor: "grab",
  userSelect: "none",
  outlineOffset: "4px",
})

export const WaypointNode = memo(function WaypointNode(
  props: NodeProps<WaypointNode>,
) {
  const [{ colors }] = useThemeStore()
  const [{ editorModelUpdater }] = useGraphSessionStore()
  const editorModelUrl = editorModelUpdater?.editorModelUrl

  // Count edges passing through this waypoint (reactive)
  const edgeCount = useStore(
    useCallback(
      state => {
        let count = 0
        state.edgeLookup.forEach(edge => {
          const wpIds = (edge.data as Record<string, unknown>)?.waypointIds as
            | string[]
            | undefined
          if (wpIds?.includes(props.id)) count++
        })
        return count
      },
      [props.id],
    ),
  )

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    top: number
    left: number
  } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ top: e.clientY, left: e.clientX })
  }, [])

  return (
    <>
      <div
        css={containerStyle}
        style={{
          backgroundColor: colors.surfaceContainerHigh,
          border: `2px solid ${colors.outlineVariant}`,
          outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
          color: colors.onSurface,
        }}
        onContextMenu={handleContextMenu}
      >
        {edgeCount > 0 ? edgeCount : ""}
      </div>

      <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />

      {contextMenu && editorModelUrl && (
        <WaypointContextMenu
          waypointId={props.id}
          anchorPosition={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
})
