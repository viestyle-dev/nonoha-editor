"use client"

import { css } from "@emotion/react"
import { alpha, Tooltip } from "@mui/material"
import { ReactFlowState, useStore } from "@xyflow/react"
import { memo, MouseEvent, useCallback, useMemo, useState } from "react"
import type { ActivityEntry, InspectorPortRef } from "nonoha-client-js"

import { NodeHandleRight } from "@/src/components/node-handle"
import { useInspector, useInspectorState, usePortActivity } from "@/src/inspector/inspector-store"
import { PeekPopover } from "@/src/inspector/peek-popover"
import { formatNumber } from "@/src/inspector/value-renderers"

// numpy dtype.str (without byte order) -> nonoha type name
const NUMPY_TYPES: Record<string, string> = {
  b1: "bool",
  i1: "i8",
  u1: "u8",
  i2: "i16",
  u2: "u16",
  i4: "i32",
  u4: "u32",
  i8: "i64",
  u8: "u64",
  f4: "f32",
  f8: "f64",
  c8: "c64",
  c16: "c128",
}

function typeName(dtype: string | null): string {
  if (!dtype) return "?"
  if (dtype[0] === "U" || dtype[0] === "S" || dtype[0] === "O") return "str"
  return NUMPY_TYPES[dtype] ?? dtype
}

/** "f32[90×160×2]" from an activity entry (shape without the batch). */
export function activityShape(entry: ActivityEntry): string {
  const dims = entry.shape ? entry.shape.slice(1) : []
  return `${typeName(entry.dtype)}[${dims.join("×") || "1"}]`
}

export function formatHz(hz: number): string {
  return hz >= 10 ? hz.toFixed(0) : hz.toFixed(1)
}

/** Values flowing now (dispatched within the last 2 s). */
export function isFlowing(entry: ActivityEntry | undefined): boolean {
  return !!entry && entry.hz > 0 && entry.age !== null && entry.age < 2
}

export const zoomedInSelector = (s: ReactFlowState) => s.transform[2] >= 1

/** Live type, rate and statistics lines for port tooltips. */
export function LiveLines({ entry }: { entry: ActivityEntry }) {
  const rate = isFlowing(entry) ? `${formatHz(entry.hz)} Hz` : entry.count > 0 ? "idle" : "no values yet"
  return (
    <>
      {"\n"}
      {`${activityShape(entry)} · ${rate}`}
      {entry.stats &&
        `\nmin ${formatNumber(entry.stats[0])}  max ${formatNumber(entry.stats[1])}  mean ${formatNumber(entry.stats[2])}`}
      {entry.last !== null && entry.last !== undefined && `\nlast ${typeof entry.last === "number" ? formatNumber(entry.last) : String(entry.last)}`}
    </>
  )
}

/**
 * Output port of an engine node with inspector decorations:
 * - the handle breathes while values flow, with the rate shown at >= 100% zoom
 * - the tooltip adds live type, rate and min/max/mean
 * - clicking the label opens a peek popover
 * Without an inspector (engine 1.0, or turned off) it is a plain handle.
 */
export const ActivityOutputHandle = memo(function ActivityOutputHandle({
  nodeId,
  port,
  handleColor,
  tooltip,
}: {
  nodeId: string
  port: string
  handleColor: string
  tooltip: string
}) {
  const inspector = useInspector()
  const { supported, enabled } = useInspectorState()
  const live = Boolean(inspector && supported && enabled)
  const portRef = useMemo<InspectorPortRef>(() => ({ node: nodeId, dir: "out", port }), [nodeId, port])
  const entry = usePortActivity(live ? portRef : null)
  const zoomedIn = useStore(zoomedInSelector)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const flowing = live && isFlowing(entry)
  const glow = flowing ? alpha(handleColor, 0.45) : undefined
  // A fixed-width slot while monitoring at >= 100% zoom, so nodes do not
  // change width when values start or stop flowing.
  const badge =
    live && zoomedIn ? (
      <span
        css={css({
          display: "inline-block",
          width: 44,
          marginRight: 4,
          textAlign: "right",
          fontSize: 10,
          lineHeight: "14px",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        })}
      >
        {flowing && (
          <span css={css({ padding: "0 4px", borderRadius: 7, background: alpha(handleColor, 0.18) })}>
            {formatHz(entry!.hz)} Hz
          </span>
        )}
      </span>
    ) : null

  const onLabelClick = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setAnchor(event.currentTarget)
  }, [])
  const closePeek = useCallback(() => setAnchor(null), [])

  return (
    <>
      <Tooltip
        title={
          <span style={{ whiteSpace: "pre-line" }}>
            {tooltip}
            {live && entry && <LiveLines entry={entry} />}
            {live && "\nClick the name to peek"}
          </span>
        }
        placement="left"
        disableInteractive
      >
        <NodeHandleRight
          id={port}
          label={port}
          handleColor={handleColor}
          glow={glow}
          badge={badge}
          onLabelClick={live ? onLabelClick : undefined}
        />
      </Tooltip>
      {anchor && <PeekPopover anchorEl={anchor} portRef={portRef} onClose={closePeek} />}
    </>
  )
})
