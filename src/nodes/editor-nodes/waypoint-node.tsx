"use client"
import { Node, NodeProps, XYPosition } from "@xyflow/react"
import { memo, useCallback, useState } from "react"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"
import { useGraphSessionStore } from "@/src/stores/graph-session-store"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { WaypointContextMenu } from "@/src/components/waypoint-context-menu"
import { WAYPOINT_SIZE } from "@/src/lib/graph/grid"
import { useWaypointUse } from "@/src/hooks/use-edge-drawing"

export type WaypointNode = Node<Record<string, never>>

/** A unique waypoint node id. */
export function generateWaypointId(): string {
  return `$wp:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** Above the edges, so a waypoint stays grabbable. */
export const WAYPOINT_Z_INDEX = 2000

/**
 * Marks a waypoint that only references and displays pass. Their lines are not
 * drawn (edge-drawing.ts), so the waypoint is neither shown nor grabbable; it
 * comes back with the lines, while a selection shows them (edge-focus.tsx).
 */
export const WAYPOINT_REFERENCE_CLASS = "waypoint-reference"

/**
 * A waypoint at `position`: its center, relative to the $graph group. Like
 * any node it is its top-left that sits on the grid (grid.ts).
 */
export function waypointNode(id: string, position: XYPosition, selected?: boolean): WaypointNode {
  return {
    id,
    type: "WaypointNode",
    position,
    origin: [0.5, 0.5],
    parentId: "$graph",
    data: {},
    zIndex: WAYPOINT_Z_INDEX,
    ...(selected ? { selected } : null),
  }
}

const containerStyle = css({
  width: WAYPOINT_SIZE,
  height: WAYPOINT_SIZE,
  boxSizing: "border-box",
  borderRadius: "50%",
  borderWidth: 1,
  borderStyle: "solid",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
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

  // The edges through this waypoint, and how many of them are drawn as lines
  const [edgeCount, lineCount] = useWaypointUse(props.id).split("|").map(Number)
  const referenceOnly = edgeCount > 0 && lineCount === 0

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
      {/* A waypoint one edge bends through recedes; one that bundles several stands out */}
      <div
        css={containerStyle}
        className={referenceOnly ? WAYPOINT_REFERENCE_CLASS : undefined}
        style={{
          backgroundColor: edgeCount > 1 ? colors.surfaceContainerHighest : colors.surfaceContainer,
          borderColor: edgeCount > 1 ? colors.outline : colors.outlineVariant,
          outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
          color: edgeCount > 1 ? colors.onSurface : colors.onSurfaceVariant,
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
