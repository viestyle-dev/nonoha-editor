"use client"

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { EngineCapabilities, fetchEngineCapabilities } from "nonoha-client-js"

import { useEngineGatewayStateStore } from "@/src/stores/engine-gateway-store"

/**
 * What the engine this editor talks to offers (inspector, plugin static
 * files, environment values). Read once per engine and shared: the
 * inspector, the view catalog, About and the environment settings all
 * read it here.
 */
export interface EngineCapabilitiesState {
  /** The engine these are about (compare with the URL you use). */
  engineGatewayUrl: string | undefined
  /** "none": an engine before 1.1, without the capabilities endpoint. */
  status: "loading" | "none" | "error" | "ok"
  capabilities: EngineCapabilities | null
  /** Read them again (e.g. when the engine's details are shown); the previous ones stay until then. */
  refresh: () => void
}

const INITIAL: EngineCapabilitiesState = {
  engineGatewayUrl: undefined,
  status: "loading",
  capabilities: null,
  refresh: () => {},
}

const EngineCapabilitiesContext = createContext<EngineCapabilitiesState>(INITIAL)

export const useEngineCapabilities = () => useContext(EngineCapabilitiesContext)

/**
 * The capabilities for `engineGatewayUrl`: "loading" while they belong to
 * another engine.
 */
export function useEngineCapabilitiesFor(engineGatewayUrl: string | undefined): EngineCapabilitiesState {
  const state = useEngineCapabilities()
  return state.engineGatewayUrl === engineGatewayUrl && engineGatewayUrl !== undefined
    ? state
    : { ...INITIAL, engineGatewayUrl, refresh: state.refresh }
}

export function EngineCapabilitiesProvider({ children }: { children: ReactNode }) {
  const [{ engineGatewayUrl }] = useEngineGatewayStateStore()
  const [revision, setRevision] = useState(0)
  const [read, setRead] = useState<Omit<EngineCapabilitiesState, "refresh">>(INITIAL)

  useEffect(() => {
    if (!engineGatewayUrl) return
    let cancelled = false
    setRead(previous => (previous.engineGatewayUrl === engineGatewayUrl ? previous : { ...INITIAL, engineGatewayUrl }))
    fetchEngineCapabilities(engineGatewayUrl)
      .then(capabilities => {
        if (!cancelled) setRead({ engineGatewayUrl, status: capabilities ? "ok" : "none", capabilities })
      })
      .catch(() => {
        if (!cancelled) setRead({ engineGatewayUrl, status: "error", capabilities: null })
      })
    return () => {
      cancelled = true
    }
  }, [engineGatewayUrl, revision])

  const refresh = useCallback(() => setRevision(r => r + 1), [])
  const value = useMemo(() => ({ ...read, refresh }), [read, refresh])
  return <EngineCapabilitiesContext.Provider value={value}>{children}</EngineCapabilitiesContext.Provider>
}
