"use client"

import { css } from "@emotion/react"
import { alpha, Tooltip } from "@mui/material"
import { ReactFlowState, useStore } from "@xyflow/react"
import { memo, MouseEvent, useCallback, useMemo, useState } from "react"
import type { ActivityEntry, InspectorPortRef } from "nonoha-client-js"

import { NodeHandleRight } from "@/src/components/node-handle"
import { isFlowing, useInspectorLive, usePortActivity } from "@/src/inspector/inspector-store"
import { PeekPopover } from "@/src/inspector/peek-popover"
import { formatHz, formatNumber } from "@/src/inspector/value-renderers"

/** "f32[90×160×2]" from an activity entry (shape without the batch; the engine sends type names). */
export function activityShape(entry: ActivityEntry): string {
  const dims = entry.shape ? entry.shape.slice(1) : []
  return `${entry.dtype ?? "?"}[${dims.join("×") || "1"}]`
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
 * - the handle breathes while values flow (the engine decides when a port
 *   stopped), with the rate shown at >= 100% zoom
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
  const live = useInspectorLive()
  const portRef = useMemo<InspectorPortRef>(() => ({ node: nodeId, dir: "out", port }), [nodeId, port])
  const entry = usePortActivity(live ? portRef : null)
  const zoomedIn = useStore(zoomedInSelector)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const flowing = live && isFlowing(entry)
  const glow = live ? alpha(handleColor, 0.45) : undefined
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
          flowing={flowing}
          badge={badge}
          onLabelClick={live ? onLabelClick : undefined}
        />
      </Tooltip>
      {anchor && <PeekPopover anchorEl={anchor} portRef={portRef} onClose={closePeek} />}
    </>
  )
})
