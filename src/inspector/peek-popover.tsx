"use client"

import { css } from "@emotion/react"
import {
  IconButton,
  MenuItem,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material"
import { Close, Pause, PlayArrow, PushPin } from "@mui/icons-material"
import { useCallback, useMemo, useState } from "react"
import type { InspectorPortRef } from "nonoha-client-js"
import { alternativeKinds, type ValueKind } from "./interpret"

import { useThemeStore } from "@/src/stores/theme-store"
import type { ColorOrder } from "@/src/lib/image-frame"
import { useInspector, usePortActivity } from "@/src/inspector/inspector-store"
import { DetectedValue, describeShape, InspectedValueView } from "@/src/inspector/inspected-value-view"

const KIND_LABELS: Record<ValueKind, string> = {
  image: "Image",
  bytes: "Bytes",
  scalar: "Number",
  vector: "Plot",
  grid: "Grid",
  bool: "Bool",
  text: "Text",
  other: "Other",
}

/** Kinds that have a display node to pin to. */
export const PINNABLE: ReadonlySet<ValueKind> = new Set<ValueKind>(["image", "bytes", "scalar", "vector"])

export function colorOrderKey(graph: string, ref: InspectorPortRef) {
  return `nonoha-editor:color-order:${graph}:${ref.node}.${ref.dir}.${ref.port}`
}

export function readColorOrder(key: string): ColorOrder {
  try {
    return localStorage.getItem(key) === "bgr" ? "bgr" : "rgb"
  } catch {
    return "rgb"
  }
}

/**
 * Peek at a port: a small, temporary view anchored to the port label.
 * Closes on outside click or Escape (Popover). The pin button turns the
 * peek into a display node connected with a dashed (inspector) edge.
 */
export function PeekPopover({
  anchorEl,
  portRef,
  onClose,
}: {
  anchorEl: HTMLElement | null
  portRef: InspectorPortRef
  onClose: () => void
}) {
  const [{ colors }] = useThemeStore()
  const inspector = useInspector()
  const activity = usePortActivity(anchorEl ? portRef : null)
  const [detected, setDetected] = useState<DetectedValue | null>(null)
  const [kind, setKind] = useState<ValueKind | undefined>(undefined)
  const [paused, setPaused] = useState(false)
  const storageKey = inspector ? colorOrderKey(inspector.graphName, portRef) : ""
  const [colorOrder, setColorOrder] = useState<ColorOrder>(() => readColorOrder(storageKey))

  const shownKind = kind ?? detected?.kind
  const kinds = useMemo(() => (detected ? alternativeKinds(detected.kind) : []), [detected])
  const isColorImage =
    shownKind === "image" && detected !== null && detected.shape.length === 4 && detected.shape[3] >= 3

  const changeColorOrder = useCallback(
    (value: ColorOrder | null) => {
      if (!value) return
      setColorOrder(value)
      try {
        localStorage.setItem(storageKey, value)
      } catch {
        // per-page only
      }
    },
    [storageKey],
  )

  const pin = useCallback(() => {
    if (!inspector?.pinHandler || !shownKind) return
    inspector.pinHandler({ ref: portRef, kind: shownKind, colorOrder })
    onClose()
  }, [inspector, portRef, shownKind, colorOrder, onClose])

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "center", horizontal: "right" }}
      transformOrigin={{ vertical: "center", horizontal: -12 }}
      slotProps={{ paper: { elevation: 6, style: { background: colors.surfaceContainerHigh, borderRadius: 12 } } }}
    >
      <div css={css({ width: 340, padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 8 })}>
        <div css={css({ display: "flex", alignItems: "center", gap: 8, minHeight: 32 })}>
          <div css={css({ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 })}>
            <Typography variant="subtitle2" noWrap css={css({ fontFamily: "monospace" })}>
              {portRef.node ? `${portRef.node}.${portRef.port}` : portRef.port}
            </Typography>
            <Typography variant="caption" css={css({ color: colors.onSurfaceVariant })}>
              {describeShape(detected)}
              {activity && activity.hz > 0 ? ` · ${activity.hz.toFixed(activity.hz < 10 ? 1 : 0)} Hz` : ""}
              {activity ? ` · ${activity.count} dispatches` : ""}
            </Typography>
          </div>
          <Tooltip title={paused ? "Resume" : "Pause"}>
            <IconButton size="small" onClick={() => setPaused(p => !p)}>
              {paused ? <PlayArrow fontSize="small" /> : <Pause fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Pin as a display node">
            <span>
              <IconButton
                size="small"
                disabled={!shownKind || !PINNABLE.has(shownKind) || !inspector?.pinHandler}
                onClick={pin}
              >
                <PushPin fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <Close fontSize="small" />
          </IconButton>
        </div>

        <InspectedValueView
          portRef={portRef}
          kind={kind}
          colorOrder={colorOrder}
          paused={paused}
          onDetected={setDetected}
        />

        {(kinds.length > 1 || isColorImage) && (
          <div css={css({ display: "flex", alignItems: "center", gap: 8 })}>
            {kinds.length > 1 && (
              <Select
                size="small"
                value={shownKind ?? ""}
                onChange={e => setKind(e.target.value as ValueKind)}
                css={css({ fontSize: 13, minWidth: 96 })}
              >
                {kinds.map(k => (
                  <MenuItem key={k} value={k}>
                    {KIND_LABELS[k]}
                  </MenuItem>
                ))}
              </Select>
            )}
            {isColorImage && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={colorOrder}
                onChange={(_e, value) => changeColorOrder(value)}
              >
                <ToggleButton value="rgb">RGB</ToggleButton>
                <ToggleButton value="bgr">BGR</ToggleButton>
              </ToggleButtonGroup>
            )}
          </div>
        )}
      </div>
    </Popover>
  )
}
