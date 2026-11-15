"use client"

import { css } from "@emotion/react"
import { Badge, Button, IconButton, Menu, Switch, Tooltip, Typography } from "@mui/material"
import { Sensors, SensorsOff } from "@mui/icons-material"
import { useState } from "react"

import { useThemeStore } from "@/src/stores/theme-store"
import { useInspector, useInspectorState } from "@/src/inspector/inspector-store"

const REASON_TEXT: Record<string, string> = {
  loop_lag: "the engine's event loop is busy",
  budget: "the data budget is used up",
  client_slow: "this tab is slow to receive",
  cpu: "sampling uses too much engine CPU",
  recovering: "recovering",
  too_many: "too many inspector connections",
}

/**
 * Inspector state for the top-right button cluster: on / throttled / paused
 * (with the reason) / off, a resume action and the default on/off switch.
 */
export function InspectorStatusButton() {
  const [{ colors }] = useThemeStore()
  const inspector = useInspector()
  const { supported, enabled, status, engineVersion } = useInspectorState()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  if (!inspector || supported === undefined) return null

  const state = !supported ? "unsupported" : !enabled ? "off" : status.state
  const dot =
    state === "ok"
      ? colors.primary
      : state === "throttled" || state === "connecting" || state === "hidden"
        ? colors.tertiary
        : state === "paused" || state === "disabled" || state === "no_graph" || state === "unsupported"
          ? colors.error
          : colors.outline
  const title =
    state === "ok"
      ? "Inspector: on"
      : state === "throttled"
        ? "Inspector: slowed down"
        : state === "paused"
          ? "Inspector: paused"
          : state === "off"
            ? "Inspector: off"
            : state === "unsupported"
              ? "Inspector: not available"
              : `Inspector: ${state}`
  const reasons = status.reasons.map(r => REASON_TEXT[r] ?? r)

  return (
    <>
      <Tooltip title={title}>
        <IconButton onClick={e => setAnchor(e.currentTarget)} aria-label={title}>
          <Badge
            variant="dot"
            overlap="circular"
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            sx={{ "& .MuiBadge-badge": { backgroundColor: dot } }}
          >
            {state === "off" || state === "unsupported" ? <SensorsOff /> : <Sensors />}
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <div css={css({ width: 300, padding: "4px 16px 8px", display: "flex", flexDirection: "column", gap: 8 })}>
          <Typography variant="subtitle2">Inspector</Typography>
          <Typography variant="body2" css={css({ color: colors.onSurfaceVariant })}>
            {state === "unsupported"
              ? `This engine${engineVersion ? ` (${engineVersion})` : ""} has no inspector. Port activity, peek and dashed connections need engine 1.1 or later. Connections through output ports keep working.`
              : state === "off"
                ? "Port activity and peek are off. Output ports and their displays keep working."
                : state === "paused"
                  ? `Paused because ${reasons.join(", ") || "the engine is busy"}. It resumes by itself when the load drops.`
                  : state === "throttled"
                    ? `Sampling less often because ${reasons.join(", ")}.`
                    : state === "ok"
                      ? "Sampling port values for activity, peek and dashed connections. Sampled values can miss updates."
                      : `State: ${state}`}
          </Typography>
          {status.lagMs && enabled && supported && (
            <Typography variant="caption" css={css({ color: colors.onSurfaceVariant })}>
              Event loop lag {status.lagMs.ewma.toFixed(0)} ms (max {status.lagMs.max.toFixed(0)} ms)
            </Typography>
          )}
          {state === "paused" && (
            <Button size="small" variant="outlined" onClick={() => inspector.resume()} css={css({ alignSelf: "flex-start" })}>
              Resume now
            </Button>
          )}
          {supported && (
            <label css={css({ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" })}>
              <Typography variant="body2">Monitor ports (default for new tabs)</Typography>
              <Switch checked={enabled} onChange={e => inspector.setEnabled(e.target.checked)} />
            </label>
          )}
        </div>
      </Menu>
    </>
  )
}
