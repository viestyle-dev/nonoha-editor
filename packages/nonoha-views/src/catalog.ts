import type { PluginInfo } from 'nonoha-client-js'
import type { DefinedView, ViewInputSpec, ViewManifest, ViewSettingSpec, ViewSuit } from './sdk'
import { VIEW_SDK_VERSION } from './sdk'

interface ViewEntryFields {
  /** "<plugin id>/<view id>" for plugin views, "builtin/<view id>" for built-in views. */
  key: string
  id: string
  title: string
  description: string
  inputs: ViewInputSpec[]
  settings: Record<string, ViewSettingSpec>
  size?: { width: number; height: number }
  suits: ViewSuit[]
}

/** A view a host can show: a built-in definition, or a plugin module to load. */
export type ViewEntry = ViewEntryFields &
  (
    | { source: 'builtin'; definition: DefinedView }
    | { source: 'plugin'; pluginId: string; pluginVersion: string | null; moduleUrl: string }
  )

/** The catalog entry of a built-in view ("builtin/<id>"), e.g. to list built-ins before plugins load. */
export function builtinViewEntry(view: DefinedView): ViewEntry {
  return {
    key: `builtin/${view.id}`,
    id: view.id,
    title: view.title ?? view.id,
    description: view.description ?? '',
    inputs: view.inputs,
    settings: view.settings ?? {},
    size: view.size,
    suits: view.suits ?? [],
    source: 'builtin',
    definition: view,
  }
}

export interface ViewCatalogOptions {
  /** Built-in views to list (keys "builtin/<id>"). */
  builtins?: readonly DefinedView[]
  /** A plugin whose manifest could not be read; the catalog goes on without it. */
  onError?: (pluginId: string, error: unknown) => void
}

/**
 * The views available on an engine: the built-ins passed in, then the
 * views of each plugin's `static/views/manifest.json` (in plugin order).
 * `plugins` is the engine's plugin list (e.g. from nonoha-client-js
 * `fetchPlugins`). Module URLs carry the plugin's static revision, so a
 * changed view is never served from the browser cache.
 */
export async function loadViewCatalog(
  engineGatewayUrl: string,
  plugins: readonly PluginInfo[],
  options: ViewCatalogOptions = {},
): Promise<Map<string, ViewEntry>> {
  const catalog = new Map<string, ViewEntry>()
  for (const view of options.builtins ?? []) {
    const entry = builtinViewEntry(view)
    catalog.set(entry.key, entry)
  }
  const manifests = await Promise.all(
    plugins.map(async plugin => {
      if (!plugin.static) return null
      const base = `http://${engineGatewayUrl}${plugin.static}views/`
      const rev = plugin.rev ? `?rev=${encodeURIComponent(plugin.rev)}` : ''
      try {
        const res = await fetch(`${base}manifest.json${rev}`)
        if (res.status === 404) return null
        if (!res.ok) throw new Error(`view manifest: HTTP ${res.status}`)
        const manifest = (await res.json()) as ViewManifest
        if (manifest.sdk !== VIEW_SDK_VERSION) {
          throw new Error(`view manifest needs view SDK ${manifest.sdk}; this host has ${VIEW_SDK_VERSION}`)
        }
        return { plugin, base, rev, manifest }
      } catch (error) {
        options.onError?.(plugin.id, error)
        return null
      }
    }),
  )
  for (const found of manifests) {
    if (!found) continue
    const { plugin, base, rev, manifest } = found
    for (const view of manifest.views ?? []) {
      const key = `${plugin.id}/${view.id}`
      catalog.set(key, {
        key,
        id: view.id,
        title: view.title ?? view.id,
        description: view.description ?? '',
        inputs: view.inputs ?? [],
        settings: view.settings ?? {},
        size: view.size,
        suits: view.suits ?? [],
        source: 'plugin',
        pluginId: plugin.id,
        pluginVersion: plugin.version,
        moduleUrl: `${base}${view.module}${rev}`,
      })
    }
  }
  return catalog
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** Fields where a loaded module differs from its catalog entry (the manifest); [] when they agree. */
export function manifestDrift(entry: ViewEntry, definition: DefinedView): ('inputs' | 'settings')[] {
  const drift: ('inputs' | 'settings')[] = []
  if (canonical(entry.inputs) !== canonical(definition.inputs)) drift.push('inputs')
  if (canonical(entry.settings) !== canonical(definition.settings ?? {})) drift.push('settings')
  return drift
}

const moduleCache = new Map<string, Promise<DefinedView>>()
const reportedDrift = new Set<string>()

/**
 * The definition of a view: a built-in as is, or a module imported once
 * per URL (a catalog entry, or the URL of a module of the app's own). For
 * a catalog entry the module is compared with its manifest once; on a
 * difference the module wins and a warning names the fields.
 */
export function loadView(view: ViewEntry | string): Promise<DefinedView> {
  if (typeof view !== 'string' && view.source === 'builtin') return Promise.resolve(view.definition)
  const url = typeof view === 'string' ? view : view.moduleUrl
  let pending = moduleCache.get(url)
  if (!pending) {
    pending = import(/* webpackIgnore: true */ /* @vite-ignore */ url).then((mod: { default?: DefinedView }) => {
      const definition = mod.default
      if (!definition || typeof definition.mount !== 'function') throw new Error(`${url} has no default view export`)
      if (definition.sdk !== VIEW_SDK_VERSION) {
        throw new Error(`${url} needs view SDK ${definition.sdk}; this host has ${VIEW_SDK_VERSION}`)
      }
      return definition
    })
    pending.catch(() => moduleCache.delete(url))
    moduleCache.set(url, pending)
  }
  if (typeof view === 'string') return pending
  return pending.then(definition => {
    if (!reportedDrift.has(url)) {
      reportedDrift.add(url)
      const drift = manifestDrift(view, definition)
      if (drift.length > 0) {
        console.warn(`[view ${view.key}] the module's ${drift.join(' and ')} differ from manifest.json; using the module's`)
      }
    }
    return definition
  })
}
