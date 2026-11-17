"use client"

import { Chip, Tooltip } from "@mui/material"
import { WarningAmber } from "@mui/icons-material"
import { enqueueSnackbar } from "notistack"
import { useEffect, useRef } from "react"

import { AboutDialog, EngineInfo } from "@/src/components/about-dialog"
import { describeCompat, engineCompatStatus, isCompatWarning } from "@/src/lib/engine-compat"
import { useInspector, useInspectorState } from "@/src/inspector/inspector-store"
import { useEngineCapabilitiesFor } from "@/src/stores/engine-capabilities-store"

/**
 * Engine version, compatibility and inspector state for the About dialog:
 * the engine's capabilities, plus this tab's inspector inside a graph page.
 */
export function useEngineInfo(engineGatewayUrl: string | undefined): EngineInfo {
  const engine = useEngineCapabilitiesFor(engineGatewayUrl)
  const inspector = useInspector()
  const inspectorState = useInspectorState()
  const capabilities = engine.status === "ok" ? engine.capabilities : null
  const version = capabilities?.engine
  const inPage = inspector?.engineGatewayUrl === engineGatewayUrl
  return {
    url: engineGatewayUrl,
    version,
    compat: engineGatewayUrl ? engineCompatStatus(version, engine.status) : "loading",
    inspector: !capabilities
      ? undefined
      : !capabilities.inspector?.enabled
        ? "off in this engine"
        : !inPage
          ? "available"
          : !inspectorState.enabled
            ? "off in this tab"
            : inspectorState.status.state,
  }
}

/**
 * Warning chip for the top-right cluster when the engine is outside the
 * supported range (shown once as a snackbar too). Opens the About dialog.
 * Operations are never blocked.
 */
export function EngineCompatChip({ info, onClick }: { info: EngineInfo; onClick: () => void }) {
  const warned = useRef<string | null>(null)
  const warning = isCompatWarning(info.compat)
  const key = `${info.url}|${info.version}`

  useEffect(() => {
    if (!warning || warned.current === key) return
    warned.current = key
    enqueueSnackbar(describeCompat(info.compat, info.version), { variant: "warning" })
  }, [warning, key, info.compat, info.version])

  if (!warning) return null
  return (
    <Tooltip title={describeCompat(info.compat, info.version)}>
      <Chip
        icon={<WarningAmber />}
        label={`Engine ${info.version}`}
        color="warning"
        variant="outlined"
        size="small"
        onClick={onClick}
        style={{ alignSelf: "center" }}
      />
    </Tooltip>
  )
}

/** About dialog fed with the engine info. */
export function EngineAboutDialog({
  open,
  onClose,
  info,
}: {
  open: boolean
  onClose: () => void
  info: EngineInfo
}) {
  return <AboutDialog open={open} onClose={onClose} engine={info} />
}

/**
 * Compat chip + About dialog for a page's top-right cluster. Render it
 * inside the page's providers so it can read the inspector store.
 */
export function EngineAboutControls({
  engineGatewayUrl,
  open,
  onOpen,
  onClose,
}: {
  engineGatewayUrl: string | undefined
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const info = useEngineInfo(engineGatewayUrl)
  // Opening the dialog reads the engine's details again (it may have been restarted).
  const { refresh } = useEngineCapabilitiesFor(engineGatewayUrl)
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])
  return (
    <>
      <EngineCompatChip info={info} onClick={onOpen} />
      <EngineAboutDialog open={open} onClose={onClose} info={info} />
    </>
  )
}
