"use client"

import { css } from "@emotion/react"
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material"

import type { ControlGateMode } from "@/src/hooks/use-control-gates"
import { useThemeStore } from "@/src/stores/theme-store"

const MODE_TIP =
  "AUTO: rec/clear follow the connected signals.\nMANUAL: signals are ignored; REC and Clear work by hand.\nReturning to AUTO re-syncs REC to the live signal (missed clear edges do not fire)."

const IGNORED_SIGNAL_TIP =
  "The rec signal is currently true (ignored in MANUAL)."

// AUTO/MANUAL selector for the chart control gates. Placed next to the
// rec/clear handles because it decides whether their signals are honored.
// MANUAL is rendered in the tertiary (attention) color so a suspended auto
// control is visible at a glance; the mode is deliberately not persisted, so
// a reload always returns to AUTO.
export const ControlModeToggle = ({
  mode,
  onModeChange,
  recSignal,
}: {
  mode: ControlGateMode
  onModeChange: (mode: ControlGateMode) => void
  recSignal: boolean | undefined
}) => {
  const [{ colors }] = useThemeStore()

  const segmentCss = css({
    padding: "1px 8px",
    fontSize: 10,
    lineHeight: 1.6,
    letterSpacing: "0.08em",
    color: colors.onSurfaceVariant,
    position: "relative",
  })

  return (
    <Tooltip
      title={<span style={{ whiteSpace: "pre-line" }}>{MODE_TIP}</span>}
      placement="top"
      arrow
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode}
        onChange={(_event, value) => {
          if (value === "auto" || value === "manual") {
            onModeChange(value)
          }
        }}
        css={css({ alignSelf: "center" })}
      >
        <ToggleButton
          value="auto"
          css={css(segmentCss, {
            "&.Mui-selected": {
              color: colors.onPrimary,
              background: colors.primary,
              "&:hover": { background: colors.primary },
            },
          })}
        >
          AUTO
          {/* A true rec signal being ignored in MANUAL is the classic
              "forgot to switch back" situation - surface it passively. */}
          {mode === "manual" && recSignal === true && (
            <Tooltip title={IGNORED_SIGNAL_TIP} placement="top" arrow>
              <span
                css={css({
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: colors.primary,
                })}
              />
            </Tooltip>
          )}
        </ToggleButton>
        <ToggleButton
          value="manual"
          css={css(segmentCss, {
            "&.Mui-selected": {
              color: colors.onTertiary,
              background: colors.tertiary,
              "&:hover": { background: colors.tertiary },
            },
          })}
        >
          MANUAL
        </ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  )
}
