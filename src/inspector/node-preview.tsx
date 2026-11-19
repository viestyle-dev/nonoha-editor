"use client"

import { css } from "@emotion/react"
import { IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from "@mui/material"
import { Done, Visibility, VisibilityOutlined } from "@mui/icons-material"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import type { InspectorPortRef } from "nonoha-client-js"

import { useThemeStore } from "@/src/stores/theme-store"
import { useInspector, useInspectorLive } from "@/src/inspector/inspector-store"
import { InspectedValueView } from "@/src/inspector/inspected-value-view"
import { colorOrderKey, readColorOrder } from "@/src/inspector/peek-popover"

/** At most this many in-node previews sample at once (those on screen first). */
export const MAX_PREVIEWS = 8

/**
 * Eye button for the node toolbar: choose which output to preview inside
 * the node (or none). Hidden when the inspector is not available.
 */
export function NodePreviewToggle({
  outputs,
  preview,
  onChange,
}: {
  outputs: string[]
  preview: string | undefined
  onChange: (port: string | undefined) => void
}) {
  const live = useInspectorLive()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!live || outputs.length === 0) return null
  return (
    <>
      <Tooltip title="Preview an output in the node">
        <IconButton size="small" css={css({ fontSize: 16 })} onClick={e => setAnchor(e.currentTarget)}>
          {preview ? <Visibility fontSize="inherit" /> : <VisibilityOutlined fontSize="inherit" />}
        </IconButton>
      </Tooltip>
      <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {outputs.map(port => (
          <MenuItem
            key={port}
            dense
            onClick={() => {
              onChange(port === preview ? undefined : port)
              setAnchor(null)
            }}
          >
            <ListItemIcon>{port === preview ? <Done fontSize="small" /> : null}</ListItemIcon>
            {port}
          </MenuItem>
        ))}
        {preview && (
          <MenuItem
            dense
            onClick={() => {
              onChange(undefined)
              setAnchor(null)
            }}
          >
            <ListItemIcon />
            No preview
          </MenuItem>
        )}
      </Menu>
    </>
  )
}

/**
 * Small live view of one output inside an engine node. Samples only while
 * the node is on screen and one of the MAX_PREVIEWS slots is free.
 */
export const NodePreview = memo(function NodePreview({ nodeId, port }: { nodeId: string; port: string }) {
  const [{ colors }] = useThemeStore()
  const inspector = useInspector()
  const live = useInspectorLive()
  const portRef = useMemo<InspectorPortRef>(() => ({ node: nodeId, dir: "out", port }), [nodeId, port])
  const box = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [granted, setGranted] = useState(false)

  useEffect(() => {
    const element = box.current
    if (!element || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(entries => setVisible(entries[entries.length - 1].isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inspector || !visible) return
    return inspector.holdPreviewSlot(setGranted)
  }, [inspector, visible])

  const colorOrder = inspector ? readColorOrder(colorOrderKey(inspector.graphName, portRef)) : "rgb"
  return (
    <div
      ref={box}
      className="nodrag"
      css={css({ margin: "4px 8px 8px", borderRadius: 6, overflow: "hidden", position: "relative" })}
    >
      {live ? (
        <InspectedValueView portRef={portRef} colorOrder={colorOrder} paused={!visible || !granted} height={96} />
      ) : null}
      {(!live || (visible && !granted)) && (
        <Typography
          variant="caption"
          css={css({
            position: live ? "absolute" : "static",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 40,
            color: colors.onSurfaceVariant,
            background: live ? colors.surfaceContainerLow : undefined,
          })}
        >
          {!live ? "Preview needs the inspector" : `Preview paused (${MAX_PREVIEWS} at most)`}
        </Typography>
      )}
    </div>
  )
})
