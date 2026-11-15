"use client"

import { css } from "@emotion/react"
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material"
import { Visibility, VisibilityOff } from "@mui/icons-material"
import { enqueueSnackbar } from "notistack"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  EnvError,
  EnvItem,
  EnvStatus,
  clearEnv,
  fetchEngineCapabilities,
  fetchEnvStatus,
  setEnv,
} from "nonoha-client-js"

import { useInspector, useInspectorState } from "@/src/inspector/inspector-store"
import { useThemeStore } from "@/src/stores/theme-store"

/**
 * Whether the engine accepts environment values from the editor. Inside a
 * graph page the inspector store already knows; elsewhere it is fetched.
 */
export function useEnvSettingsSupported(engineGatewayUrl: string | undefined): boolean {
  const inspector = useInspector()
  const state = useInspectorState()
  const useOwn = !inspector || inspector.engineGatewayUrl !== engineGatewayUrl
  const [own, setOwn] = useState(false)

  useEffect(() => {
    if (!useOwn || !engineGatewayUrl) return
    let cancelled = false
    fetchEngineCapabilities(engineGatewayUrl)
      .then(caps => !cancelled && setOwn(Boolean(caps?.env_settings)))
      .catch(() => !cancelled && setOwn(false))
    return () => {
      cancelled = true
    }
  }, [useOwn, engineGatewayUrl])

  return useOwn ? own : state.envSettings
}

/** "Environment settings" entry for a page's top-right menu (hidden on older engines). */
export function EnvSettingsMenuItem({
  engineGatewayUrl,
  onClick,
}: {
  engineGatewayUrl: string | undefined
  onClick: () => void
}) {
  const supported = useEnvSettingsSupported(engineGatewayUrl)
  if (!supported) return null
  return <MenuItem onClick={onClick}>Environment settings</MenuItem>
}

function sourceLabel(item: EnvItem): string {
  if (!item.set) return "Not set"
  return item.source === "os" ? "Set (OS environment)" : "Set (.env)"
}

/**
 * Environment values of the connected engine (API keys and similar). Values
 * are write-only: the engine never sends them back, so this dialog shows
 * names and status, and accepts new values.
 */
export function EnvSettingsDialog({
  open,
  onClose,
  engineGatewayUrl,
}: {
  open: boolean
  onClose: () => void
  engineGatewayUrl: string | undefined
}) {
  const [{ colors }] = useThemeStore()
  const [status, setStatus] = useState<EnvStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)
  // What the user is typing, per name; cleared after saving or closing
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})

  const styles = useMemo(
    () => ({
      intro: css({ color: colors.onSurfaceVariant, marginBottom: 16 }),
      item: css({
        padding: 16,
        marginBottom: 12,
        backgroundColor: colors.surfaceContainerLow,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }),
      header: css({ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }),
      name: css({ fontFamily: "monospace", fontWeight: 600, wordBreak: "break-all" }),
      muted: css({ color: colors.onSurfaceVariant }),
      reason: css({ color: colors.onSurfaceVariant, fontStyle: "italic" }),
      row: css({ display: "flex", gap: 8, alignItems: "center" }),
      center: css({ display: "flex", justifyContent: "center", padding: 24 }),
    }),
    [colors],
  )

  const load = useCallback(() => {
    if (!engineGatewayUrl) return
    setLoading(true)
    fetchEnvStatus(engineGatewayUrl)
      .then(setStatus)
      .catch((e: unknown) => {
        setStatus(null)
        enqueueSnackbar(`Environment settings: ${e instanceof Error ? e.message : String(e)}`, { variant: "error" })
      })
      .finally(() => setLoading(false))
  }, [engineGatewayUrl])

  useEffect(() => {
    if (open) {
      load()
    } else {
      setDrafts({})
      setShown({})
    }
  }, [open, load])

  const save = async (name: string, value: string | null) => {
    if (!engineGatewayUrl) return
    setBusyName(name)
    try {
      const next = value === null ? await clearEnv(engineGatewayUrl, name) : await setEnv(engineGatewayUrl, name, value)
      setStatus(next)
      setDrafts(d => ({ ...d, [name]: "" }))
      setShown(s => ({ ...s, [name]: false }))
      enqueueSnackbar(
        value === null
          ? `${name} removed. Nodes stop using it now; libraries after a restart.`
          : `${name} saved. Nodes use it now; libraries and child processes after a restart.`,
        { variant: "success" },
      )
    } catch (e) {
      const message = e instanceof EnvError ? e.message : String(e)
      enqueueSnackbar(`${name}: ${message}`, { variant: "error" })
    } finally {
      setBusyName(null)
    }
  }

  const items = status?.items ?? []

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Environment settings</DialogTitle>
      <DialogContent>
        <Typography variant="body2" css={styles.intro}>
          Values such as API keys that nodes in this engine read. They are stored on this engine&apos;s machine
          {status?.file ? ` (${status.file})` : ""}, never in the graph, and cannot be shown again after saving.
          {status && !status.file && " This engine has no environment file, so values can only come from the OS."}
          {status?.file && !status.writable && " The file is read-only."}
        </Typography>

        {loading && !status && (
          <div css={styles.center}>
            <CircularProgress size={24} />
          </div>
        )}

        {status && items.length === 0 && (
          <Typography variant="body2" css={styles.muted}>
            No node in the loaded graphs uses environment values.
          </Typography>
        )}

        {items.map(item => {
          const draft = drafts[item.name] ?? ""
          const busy = busyName === item.name
          return (
            <Paper key={item.name} css={styles.item} elevation={0}>
              <div css={styles.header}>
                <Typography variant="body2" css={styles.name}>
                  {item.name}
                </Typography>
                <Chip
                  size="small"
                  label={sourceLabel(item)}
                  color={item.set ? "primary" : "default"}
                  variant={item.set ? "filled" : "outlined"}
                />
              </div>
              {item.description && <Typography variant="body2">{item.description}</Typography>}
              {(item.url || item.declared_by.length > 0) && (
                <Typography variant="caption" css={styles.muted}>
                  {item.declared_by.length > 0 && `Used by ${item.declared_by.join(", ")}`}
                  {item.url && item.declared_by.length > 0 && " · "}
                  {item.url && (
                    <Link href={item.url} target="_blank" rel="noopener noreferrer">
                      Get a value
                    </Link>
                  )}
                </Typography>
              )}
              {item.writable ? (
                <div css={styles.row}>
                  <TextField
                    size="small"
                    fullWidth
                    autoComplete="off"
                    type={shown[item.name] ? "text" : "password"}
                    placeholder={item.set ? "Enter a new value to replace it" : "Enter a value"}
                    value={draft}
                    disabled={busy}
                    onChange={e => setDrafts(d => ({ ...d, [item.name]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === "Enter" && draft) void save(item.name, draft)
                    }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              aria-label={shown[item.name] ? "Hide what you type" : "Show what you type"}
                              onClick={() => setShown(s => ({ ...s, [item.name]: !s[item.name] }))}
                              edge="end"
                            >
                              {shown[item.name] ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <Button variant="contained" disabled={!draft || busy} onClick={() => void save(item.name, draft)}>
                    Save
                  </Button>
                  {item.set && item.source === "file" && (
                    <Button disabled={busy} onClick={() => void save(item.name, null)}>
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                item.reason && (
                  <Typography variant="caption" css={styles.reason}>
                    {item.reason}
                  </Typography>
                )
              )}
            </Paper>
          )
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={load} disabled={loading}>
          Refresh
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
