"use client"

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react"
import {
  DefinedView,
  fetchPlugins,
  fetchViewManifest,
  inputAccepts,
  pluginViewsBase,
  ViewInputSpec,
  ViewManifest,
  ViewSettingSpec,
  ViewTheme,
} from "nonoha-client-js"

import type { ChartTheme } from "@/src/lib/chart-theme"
import { useInspectorState } from "@/src/inspector/inspector-store"

/**
 * Views available to this editor tab: plugin views (static/views of the
 * plugins the engine loaded) and the built-in views of nonoha-client-js.
 * Keys are "<plugin id>/<view id>" or "builtin/<view id>".
 */
export interface ViewEntry {
  key: string
  source: "plugin" | "builtin"
  pluginId?: string
  pluginVersion?: string | null
  title: string
  description: string
  inputs: ViewInputSpec[]
  settings: Record<string, ViewSettingSpec>
  size?: { width: number; height: number }
  suits: { node: string; port: string }[]
  /** Module URL (plugin views) or the definition itself (built-ins). */
  moduleUrl?: string
  definition?: DefinedView
}

export interface PortHint {
  node: string
  port: string
  colorOrder?: "rgb" | "bgr"
}

interface ViewCatalog {
  loaded: boolean
  entries: Map<string, ViewEntry>
  /** Hints from plugin manifests, keyed "<node type>.<port>". */
  portHints: Map<string, PortHint>
}

const EMPTY: ViewCatalog = { loaded: false, entries: new Map(), portHints: new Map() }
const ViewCatalogContext = createContext<ViewCatalog>(EMPTY)

export const useViewCatalog = () => useContext(ViewCatalogContext)

function builtinEntries(builtins: readonly DefinedView[]): ViewEntry[] {
  return builtins.map(view => ({
    key: `builtin/${view.id}`,
    source: "builtin" as const,
    title: view.title ?? view.id,
    description: view.description ?? "",
    inputs: view.inputs,
    settings: view.settings ?? {},
    size: view.size,
    suits: [],
    definition: view,
  }))
}

export function ViewCatalogProvider({
  engineGatewayUrl,
  builtins,
  children,
}: {
  engineGatewayUrl: string | undefined
  builtins: readonly DefinedView[]
  children: ReactNode
}) {
  const { pluginStatic, capabilities } = useInspectorState()
  const [plugins, setPlugins] = useState<{ entries: ViewEntry[]; hints: PortHint[] } | null>(null)

  useEffect(() => {
    if (!engineGatewayUrl || capabilities === "loading") return
    if (!pluginStatic) {
      setPlugins({ entries: [], hints: [] })
      return
    }
    let cancelled = false
    ;(async () => {
      const entries: ViewEntry[] = []
      const hints: PortHint[] = []
      const list = await fetchPlugins(engineGatewayUrl).catch(() => [])
      await Promise.all(
        list.map(async plugin => {
          const base = pluginViewsBase(engineGatewayUrl, plugin)
          if (!base) return
          const manifest: ViewManifest | null = await fetchViewManifest(base, plugin.rev).catch(() => null)
          if (!manifest) return
          for (const view of manifest.views ?? []) {
            entries.push({
              key: `${plugin.id}/${view.id}`,
              source: "plugin",
              pluginId: plugin.id,
              pluginVersion: plugin.version,
              title: view.title ?? view.id,
              description: view.description ?? "",
              inputs: view.inputs ?? [],
              settings: view.settings ?? {},
              size: view.size,
              suits: view.suits ?? [],
              moduleUrl: `${base}${view.module}${plugin.rev ? `?rev=${plugin.rev}` : ""}`,
            })
          }
          for (const hint of manifest.portHints ?? []) hints.push(hint)
        }),
      )
      if (!cancelled) setPlugins({ entries, hints })
    })()
    return () => {
      cancelled = true
    }
  }, [engineGatewayUrl, pluginStatic, capabilities])

  const value = useMemo<ViewCatalog>(() => {
    const entries = new Map<string, ViewEntry>()
    for (const entry of builtinEntries(builtins)) entries.set(entry.key, entry)
    const portHints = new Map<string, PortHint>()
    if (plugins) {
      for (const entry of plugins.entries) entries.set(entry.key, entry)
      for (const hint of plugins.hints) portHints.set(`${hint.node}.${hint.port}`, hint)
    }
    return { loaded: plugins !== null, entries, portHints }
  }, [builtins, plugins])

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
