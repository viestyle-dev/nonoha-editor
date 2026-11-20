"use client"

import { css } from "@emotion/react"
import { Divider } from "@mui/material"
import { ReactNode, useState } from "react"

import { EditableTypography } from "@/src/components/editable-typography"
import { PORTS_TOP, ROW } from "@/src/lib/graph/grid"

/**
 * The top of a node: a title bar, a divider and a gap. Together they are
 * PORTS_TOP high, so the first port row below starts on a row line (grid.ts).
 */

export const TITLE_BAR_HEIGHT = 32

/** Between the divider under the title bar (1 px) and the first port row. */
export const TITLE_GAP = PORTS_TOP - TITLE_BAR_HEIGHT - 1

const titleBar = css({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  boxSizing: "border-box",
  width: "100%",
  height: TITLE_BAR_HEIGHT,
  padding: "0 8px",
})
// With a line under the title: one row more, the two lines from the top
const titleBarWithSubtitle = css({
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  boxSizing: "border-box",
  width: "100%",
  height: TITLE_BAR_HEIGHT + ROW,
  padding: "8px 8px 0",
})
const subtitleLine = css({ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" })
const gap = css({ flexShrink: 0, height: TITLE_GAP })

/**
 * The header of an editor node: its title (edited in place; the node is
 * dragged by it otherwise), an optional line under it, the divider and the gap.
 */
export function EditorNodeHeader({ label, subtitle }: { label: string; subtitle?: ReactNode }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <div className={editing ? "" : "drag-handle"} css={subtitle === undefined ? titleBar : titleBarWithSubtitle}>
        <EditableTypography editing={editing} onEditingChange={setEditing} text={label} fontSize={14} />
        {subtitle !== undefined && <div css={subtitleLine}>{subtitle}</div>}
      </div>
      <Divider />
      <div css={gap} />
    </>
  )
}
