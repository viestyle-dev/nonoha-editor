"use client"

import { Chip, Tooltip } from "@mui/material"
import { WarningAmber } from "@mui/icons-material"
import { enqueueSnackbar } from "notistack"
import { useEffect, useRef, useState } from "react"
import { EngineCapabilities, fetchEngineCapabilities } from "nonoha-client-js"

import { AboutDialog, EngineInfo } from "@/src/components/about-dialog"
import { describeCompat, engineCompatStatus, isCompatWarning } from "@/src/lib/engine-compat"
import { useInspector, useInspectorState } from "@/src/inspector/inspector-store"

/**
 * Engine version, compatibility and inspector state for the About dialog.
 * Inside a graph page the inspector store already holds the capabilities;
 * elsewhere (graph list) they are fetched once.
 */
export function useEngineInfo(engineGatewayUrl: string | undefined): EngineInfo {
  const inspector = useInspector()
  const inspectorState = useInspectorState()
  const [own, setOwn] = useState<{ caps: EngineCapabilities | null; status: "loading" | "none" | "error" | "ok" }>({
    caps: null,
    status: "loading",
  })
  const useOwn = !inspector || inspector.engineGatewayUrl !== engineGatewayUrl

  useEffect(() => {
    if (!useOwn || !engineGatewayUrl) return
    let cancelled = false
    setOwn({ caps: null, status: "loading" })
    fetchEngineCapabilities(engineGatewayUrl)
      .then(caps => !cancelled && setOwn({ caps, status: caps ? "ok" : "none" }))
      .catch(() => !cancelled && setOwn({ caps: null, status: "error" }))
    return () => {
      cancelled = true
    }
  }, [useOwn, engineGatewayUrl])

  if (useOwn) {
    const version = own.caps?.engine
    return {
      url: engineGatewayUrl,
      version,
      compat: engineGatewayUrl ? engineCompatStatus(version, own.status) : "loading",
      inspector: own.caps ? (own.caps.inspector?.enabled ? "available" : "off in this engine") : undefined,
    }
  }
  const { engineVersion, capabilities, supported, enabled, status } = inspectorState
  return {
    url: engineGatewayUrl,
    version: engineVersion,
    compat: engineCompatStatus(engineVersion, capabilities),
    inspector:
      capabilities !== "ok"
        ? undefined
        : !supported
          ? "off in this engine"
          : !enabled
            ? "off in this tab"
            : status.state,
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
  return (
    <>
      <EngineCompatChip info={info} onClick={onOpen} />
      <EngineAboutDialog open={open} onClose={onClose} info={info} />
    </>
  )
}
