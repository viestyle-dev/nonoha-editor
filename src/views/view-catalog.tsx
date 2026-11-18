"use client"

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react"
import { fetchPlugins, pluginStaticUrl } from "nonoha-client-js"
import { builtinViewEntry, inputAccepts, loadViewCatalog, type DefinedView, type ViewEntry, type ViewTheme } from "nonoha-views"

import type { ChartTheme } from "@/src/lib/chart-theme"
import { useEngineCapabilitiesFor } from "@/src/stores/engine-capabilities-store"

export type { ViewEntry } from "nonoha-views"

/**
 * Views available to this editor tab: the built-in views and the views of
 * the plugins the engine loaded. Keys are "<plugin id>/<view id>" or
 * "builtin/<view id>".
 */
interface ViewCatalog {
  /** Plugin views have been looked up (built-ins are always there). */
  loaded: boolean
  entries: ReadonlyMap<string, ViewEntry>
}

const ViewCatalogContext = createContext<ViewCatalog>({ loaded: false, entries: new Map() })

export const useViewCatalog = () => useContext(ViewCatalogContext)

export function ViewCatalogProvider({
  engineGatewayUrl,
  builtins,
  children,
}: {
  engineGatewayUrl: string | undefined
  builtins: readonly DefinedView[]
  children: ReactNode
}) {
  const engine = useEngineCapabilitiesFor(engineGatewayUrl)
  const settled = engine.status !== "loading"
  const pluginStatic = Boolean(engine.capabilities?.plugin_static)
  const [loaded, setLoaded] = useState<ReadonlyMap<string, ViewEntry> | null>(null)

  useEffect(() => {
    setLoaded(null)
    if (!engineGatewayUrl || !settled) return
    let cancelled = false
    const onError = (pluginId: string, error: unknown) => console.warn(`[views] ${pluginId}:`, error)
    ;(async () => {
      const catalog = pluginStatic
        ? await loadViewCatalog({
            plugins: await fetchPlugins(engineGatewayUrl).catch(() => []),
            staticUrl: (plugin, path) => pluginStaticUrl(engineGatewayUrl, plugin, path),
            builtins,
            onError,
          })
        : await loadViewCatalog({ builtins, onError })
      if (!cancelled) setLoaded(catalog)
    })()
    return () => {
      cancelled = true
    }
  }, [engineGatewayUrl, settled, pluginStatic, builtins])

  const value = useMemo<ViewCatalog>(() => {
    if (loaded) return { loaded: true, entries: loaded }
    const entries = new Map<string, ViewEntry>()
    for (const view of builtins) {
      const entry = builtinViewEntry(view)
      entries.set(entry.key, entry)
    }
    return { loaded: false, entries }
  }, [builtins, loaded])

  return <ViewCatalogContext.Provider value={value}>{children}</ViewCatalogContext.Provider>
}

/** Views with an input that accepts `portType`, best suited first. */
export function viewsForPort(
  catalog: ViewCatalog,
  nodeType: string | undefined,
  port: string,
  portType: string,
): { entry: ViewEntry; input: string }[] {
  const out: { entry: ViewEntry; input: string; score: number }[] = []
  catalog.entries.forEach(entry => {
    const input = entry.inputs.find(i => inputAccepts(i, portType))
    if (!input) return
    const suited = nodeType !== undefined && entry.suits.some(s => s.node === nodeType && s.port === port)
    out.push({ entry, input: input.name, score: suited ? 0 : entry.source === "plugin" ? 1 : 2 })
  })
  out.sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title))
  return out.map(({ entry, input }) => ({ entry, input }))
}

/** ViewTheme from the editor's chart theme (charts and views look alike). */
export function viewThemeFrom(chart: ChartTheme, surface: string): ViewTheme {
  return {
    isDark: chart.isDark,
    background: chart.plotBackground,
    surface,
    text: chart.text,
    textMuted: chart.textMuted,
    grid: chart.grid,
    accent: chart.accent,
    series: chart.series,
    fontFamily: chart.fontFamily,
  }
}
