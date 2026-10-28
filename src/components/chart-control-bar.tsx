"use client"

import { css } from "@emotion/react"
import { Button, FormControlLabel, Switch, Tooltip } from "@mui/material"

import type { ControlGateMode } from "@/src/hooks/use-control-gates"

const REC_LOCKED_TIP =
  "Driven by the rec signal — switch to MANUAL (top right) to operate."

const CLEAR_LOCKED_TIP =
  "Driven by the clear signal — switch to MANUAL (top right) to operate."

// Shared capture-control row for chart nodes: REC switch + optional Clear
// button, laid out horizontally. In AUTO mode each control is disabled only
// when its own gate is connected (an unconnected function has no driving
// signal, so it stays manual even in AUTO).
export const ChartControlBar = ({
  recording,
  onRecordingChange,
  onClear,
  mode,
  recConnected,
  clearConnected,
}: {
  recording: boolean
  onRecordingChange: (recording: boolean) => void
  // Omit for snapshot-style charts that have no clear concept.
  onClear?: () => void
  mode: ControlGateMode
  recConnected: boolean
  clearConnected: boolean
}) => {
  const recLocked = mode === "auto" && recConnected
  const clearLocked = mode === "auto" && clearConnected

  const recSwitch = (
    <FormControlLabel
      control={
        <Switch
          checked={recording}
          disabled={recLocked}
          onChange={event => onRecordingChange(event.target.checked)}
        />
      }
      label="REC"
    />
  )

  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
      })}
    >
      {recLocked ? (
        // MUI tooltips need a wrapper around disabled children.
        <Tooltip title={REC_LOCKED_TIP} arrow>
          <span>{recSwitch}</span>
        </Tooltip>
      ) : (
        recSwitch
      )}
      {onClear !== undefined &&
        (clearLocked ? (
          <Tooltip title={CLEAR_LOCKED_TIP} arrow>
            <span>
              <Button variant="text" size="small" disabled>
                Clear
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button variant="text" size="small" onClick={onClear}>
            Clear
          </Button>
        ))}
    </div>
  )
}
