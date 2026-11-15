"use client"

import { css } from "@emotion/react"
import { Button, Dialog, DialogActions, DialogContent, Paper, Typography } from "@mui/material"
import { CheckCircleOutline, ErrorOutline, InfoOutlined, WarningAmber } from "@mui/icons-material"
import { useMemo } from "react"

import { useThemeStore } from "@/src/stores/theme-store"
import { describeCompat, EngineCompatStatus } from "@/src/lib/engine-compat"

export const EDITOR_VERSION = process.env.NEXT_PUBLIC_EDITOR_VERSION ?? "dev"
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export interface EngineInfo {
  url: string | undefined
  version: string | undefined
  compat: EngineCompatStatus
  /** e.g. "on", "off", "not available" */
  inspector?: string
}

/**
 * "About nonoha Editor": the brand card (laid out like nonoha Hub's) and the
 * engine this tab is connected to, with its compatibility.
 */
export function AboutDialog({
  open,
  onClose,
  engine,
}: {
  open: boolean
  onClose: () => void
  engine: EngineInfo
}) {
  const [{ colors }] = useThemeStore()
  const styles = useMemo(
    () => ({
      card: css({
        maxWidth: 288,
        margin: "0 auto 24px",
        padding: "32px 24px",
        backgroundColor: colors.surfaceContainerLow,
        borderRadius: 12,
        textAlign: "center",
      }),
      logo: css({
        maxWidth: 256,
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 16,
        margin: "24px 0",
      }),
      subtitle: css({ color: colors.onSurfaceVariant }),
      section: css({
        padding: 16,
        backgroundColor: colors.surfaceContainerLow,
        borderRadius: 12,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 16,
        rowGap: 6,
        alignItems: "baseline",
      }),
      label: css({ color: colors.onSurfaceVariant }),
      value: css({ wordBreak: "break-all" }),
    }),
    [colors],
  )

  const compatIcon =
    engine.compat === "ok" ? (
      <CheckCircleOutline fontSize="inherit" style={{ color: colors.primary }} />
    ) : engine.compat === "too_old" || engine.compat === "too_new" ? (
      <WarningAmber fontSize="inherit" style={{ color: colors.tertiary }} />
    ) : engine.compat === "unreachable" ? (
      <ErrorOutline fontSize="inherit" style={{ color: colors.error }} />
    ) : (
      <InfoOutlined fontSize="inherit" style={{ color: colors.onSurfaceVariant }} />
    )

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogContent>
        <Paper css={styles.card} elevation={0}>
          <Typography variant="subtitle1" fontWeight={600}>
            nonoha Editor
          </Typography>
          {/* Static export (served by the engine): no image optimizer, a plain img is right. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/nonoha-engine-icon.png`} alt="nonoha" css={styles.logo} />
          <Typography variant="body2" css={styles.subtitle}>
            version: {EDITOR_VERSION}
          </Typography>
          <Typography variant="body2" css={styles.subtitle}>
            &copy; 2025- nonoha
          </Typography>
        </Paper>

        <Typography variant="subtitle2" gutterBottom>
          Connected engine
        </Typography>
        <Paper css={styles.section} elevation={0}>
          <Typography variant="body2" css={styles.label}>
            URL
          </Typography>
          <Typography variant="body2" css={styles.value}>
            {engine.url ?? "—"}
          </Typography>
          <Typography variant="body2" css={styles.label}>
            Version
          </Typography>
          <Typography variant="body2">
            {engine.version ?? (engine.compat === "legacy" ? "1.0 (exact version unknown)" : "—")}
          </Typography>
          {engine.inspector && (
            <>
              <Typography variant="body2" css={styles.label}>
                Inspector
              </Typography>
              <Typography variant="body2">{engine.inspector}</Typography>
            </>
          )}
          <Typography variant="body2" css={styles.label}>
            Compatibility
          </Typography>
          <Typography variant="body2" css={css({ display: "flex", gap: 6, alignItems: "flex-start" })}>
            <span css={css({ paddingTop: 2 })}>{compatIcon}</span>
            <span>{describeCompat(engine.compat, engine.version)}</span>
          </Typography>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
