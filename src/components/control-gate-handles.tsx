"use client"

import { Tooltip } from "@mui/material"
import { hexFromArgb } from "@material/material-color-utilities"

import { NodeHandleLeft } from "@/src/components/node-handle"
import {
  getHctFromPortValueType,
  useNodeFlowColorsStore,
} from "@/src/stores/node-flow-colors-store"

const REC_TIP =
  "Recording gate [bool]\nRecords only while the connected signal is true.\nNumeric signals: 0 = false, non-zero = true.\nThe AUTO/MANUAL toggle (top right) can suspend signal control."

const CLEAR_TIP =
  "Clear trigger [bool]\nClears the plot on a false -> true rising edge.\nWire the same signal as rec (e.g. meditation_active) to start each session with a fresh plot.\nThe AUTO/MANUAL toggle (top right) can suspend signal control."

// The rec/clear control handles for chart nodes. The bool type color (same
// type-color language as engine nodes) plus hover descriptions make the
// accepted signal and the behavior discoverable at first sight.
export const ControlGateHandles = ({ withClear }: { withClear: boolean }) => {
  const [flowColorsState] = useNodeFlowColorsStore()
  // The pallet is empty until the provider's useEffect fills it — render
  // without a color on the very first frame.
  const boolHct = getHctFromPortValueType("bool", flowColorsState.pallet)
  const boolColor = boolHct ? hexFromArgb(boolHct.toInt()) : undefined

  return (
    <>
      <Tooltip
        title={<span style={{ whiteSpace: "pre-line" }}>{REC_TIP}</span>}
        placement="right"
      >
        <NodeHandleLeft id="rec" label="rec" handleColor={boolColor} />
      </Tooltip>
      {withClear && (
        <Tooltip
          title={<span style={{ whiteSpace: "pre-line" }}>{CLEAR_TIP}</span>}
          placement="right"
        >
          <NodeHandleLeft id="clear" label="clear" handleColor={boolColor} />
        </Tooltip>
      )}
    </>
  )
}
