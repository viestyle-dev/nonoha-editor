import type { PluginInfo } from 'nonoha-client-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinViewEntry, loadView, loadViewCatalog, manifestDrift, type ViewEntry } from '../catalog'
import { defineView, type ViewManifest } from '../sdk'

const builtin = defineView({
  id: 'meter',
  title: 'Meter',
  inputs: [{ name: 'x', accepts: ['f32[?]'] }],
  settings: { decay: { type: 'number', default: 1 } },
  mount() {},
})

/** As nonoha-client-js `pluginStaticUrl` builds them (the host's part). */
const staticUrl = (plugin: PluginInfo, path: string) => (plugin.static ? `http://h${plugin.static}${path}#${plugin.rev ?? ''}` : null)

const plugin = (id: string, extra: Partial<PluginInfo> = {}): PluginInfo => ({
  id,
  builtin: false,
  version: '1.0.0',
  static: `/plugins/${id}/static/`,
  rev: 'r 1',
  ...extra,
})

const manifest: ViewManifest = {
  sdk: 1,
  views: [
    {
      id: 'overlay',
      title: 'Overlay',
      module: 'overlay.js',
      inputs: [{ name: 'image', accepts: ['u8[?x?x3]'] }],
      suits: [{ node: 'Grid', port: 'out' }],
    },
  ],
}

function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
  const urls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url)
    const route = routes[url] ?? { status: 404 }
    return { ok: route.status >= 200 && route.status < 300, status: route.status, json: async () => route.body }
  })
  return urls
}

afterEach(() => vi.unstubAllGlobals())

describe('loadViewCatalog', () => {
  it('lists built-ins, then plugin views by "<plugin id>/<view id>", with URLs from the host', async () => {
    const base = 'http://h/plugins/cv_nodes/static/views/'
    const urls = fakeFetch({ [`${base}manifest.json#r 1`]: { status: 200, body: manifest } })
    const catalog = await loadViewCatalog({
      plugins: [plugin('cv_nodes'), plugin('plain', { static: null })],
      staticUrl,
      builtins: [builtin],
    })
    expect(Array.from(catalog.keys())).toEqual(['builtin/meter', 'cv_nodes/overlay'])
    const entry = catalog.get('cv_nodes/overlay')!
    expect(entry).toMatchObject({
      source: 'plugin',
      pluginId: 'cv_nodes',
      pluginVersion: '1.0.0',
      title: 'Overlay',
      description: '',
      settings: {},
      suits: [{ node: 'Grid', port: 'out' }],
      moduleUrl: `${base}overlay.js#r 1`,
    })
    expect(catalog.get('builtin/meter')).toMatchObject({ source: 'builtin', definition: builtin, suits: [] })
    expect(urls).toEqual([`${base}manifest.json#r 1`]) // no request for a plugin without static/
  })

  it('skips plugins without views and reports broken manifests', async () => {
    fakeFetch({
      'http://h/plugins/a/static/views/manifest.json#': { status: 500 },
      'http://h/plugins/b/static/views/manifest.json#': { status: 200, body: { sdk: 2, views: [] } },
    })
    const errors: [string, string][] = []
    const catalog = await loadViewCatalog({
      plugins: [plugin('a', { rev: null }), plugin('b', { rev: null }), plugin('c', { rev: null })],
      staticUrl,
      onError: (id, error) => errors.push([id, String(error)]),
    })
    expect(catalog.size).toBe(0)
    expect(errors.map(([id]) => id)).toEqual(['a', 'b'])
    expect(errors[1][1]).toMatch(/SDK 2/)
  })

  it('lists only built-ins without plugins', async () => {
    const catalog = await loadViewCatalog({ builtins: [builtin] })
    expect(Array.from(catalog.keys())).toEqual(['builtin/meter'])
  })
})

describe('manifestDrift', () => {
  it('names the fields where a module differs from its manifest', () => {
    const entry = builtinViewEntry(builtin)
    expect(manifestDrift(entry, builtin)).toEqual([])
    const changed = defineView({ ...builtin, settings: { decay: { type: 'number', default: 2 } } })
    expect(manifestDrift(entry, changed)).toEqual(['settings'])
    const noSettings = defineView({ id: 'meter', inputs: [{ name: 'y', accepts: ['f32'] }], mount() {} })
    expect(manifestDrift({ ...entry, settings: {} }, noSettings)).toEqual(['inputs'])
  })

  it('ignores key order and absent fields', () => {
    const entry: ViewEntry = { ...builtinViewEntry(builtin), inputs: [{ accepts: ['f32[?]'], name: 'x', description: undefined }] }
    expect(manifestDrift(entry, builtin)).toEqual([])
  })
})

describe('loadView', () => {
  it('returns a built-in definition as is', async () => {
    expect(await loadView(builtinViewEntry(builtin))).toBe(builtin)
  })
})
