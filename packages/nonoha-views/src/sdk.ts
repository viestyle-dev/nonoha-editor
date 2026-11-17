import type { PortValue } from 'nonoha-client-js'

/**
 * The view contract (SDK 1): a view is a display part that receives port
 * values from its host and draws into the element it is given. Views only
 * read: they never send values to a graph (graph inputs belong to the host).
 *
 * A plugin ships views as plain ES modules with no imports, next to a
 * manifest generated from them (see bin/view-manifest.mjs):
 *
 * ```js
 * // <plugin>/static/views/level.js
 * export default {
 *   sdk: 1,
 *   id: "level",
 *   inputs: [{ name: "values", accepts: ["f32[?]"], delivery: "latest" }],
 *   settings: { gain: { type: "number", default: 1, min: 0, max: 10 } },
 *   suits: [{ node: "MyNode", port: "out" }],
 *   mount(el, ctx) {
 *     const canvas = el.appendChild(document.createElement("canvas"))
 *     let latest = null
 *     ctx.onValues("values", values => { latest = values[0]; ctx.requestFrame(draw) })
 *     function draw() { ... ctx.settings.gain ... }
 *     return { destroy() { canvas.remove() } }
 *   },
 * }
 * ```
 *
 * Ports carry plain arrays: a view states which types and shapes it accepts
 * and decides itself what they mean.
 */

export const VIEW_SDK_VERSION = 1

export interface ViewInputSpec {
  name: string
  /** Accepted value types, nonoha notation with ? for any size, e.g. "u8[?x?x3]", "f32[?]", "f32[*]", "any". */
  accepts: string[]
  /**
   * What the view needs of the values (only the view knows):
   * - "every" (default): a stream. The view uses each value (history,
   *   meters, events); hosts deliver every value they get, from now on.
   * - "latest": a state. The view draws the latest value; hosts show the
   *   current value first and may skip values in between (e.g. images).
   * Hosts that sample (an inspector) may still drop values under load.
   */
  delivery?: 'every' | 'latest'
  description?: string
  /** Optional input: the view works without it. */
  optional?: boolean
}

/**
 * A setting. The host hands the view resolved values: numbers parsed and
 * clamped to min/max, booleans and enum strings checked, the default
 * otherwise. Views read `ctx.settings` as is.
 */
export interface ViewSettingSpec {
  type: 'number' | 'string' | 'boolean'
  default?: number | string | boolean
  enum?: string[]
  min?: number
  max?: number
  description?: string
}

/** An engine node output the view suits (used to suggest it). */
export interface ViewSuit {
  node: string
  port: string
}

export interface ViewTheme {
  isDark: boolean
  background: string
  surface: string
  text: string
  textMuted: string
  grid: string
  accent: string
  /** Categorical colors for series. */
  series: readonly string[]
  fontFamily: string
}

export interface ViewContext {
  /** Values for one input, batch first. Valid during the callback: the host may reuse the arrays, so copy what you keep. */
  onValues(input: string, callback: (values: PortValue[]) => void): () => void
  /** Run `draw` once on the next animation frame (calls within a frame coalesce). */
  requestFrame(draw: () => void): void
  /** Current settings, resolved against the specs (see ViewSettingSpec). */
  readonly settings: Readonly<Record<string, unknown>>
  readonly theme: ViewTheme
  readonly size: { readonly width: number; readonly height: number }
}

export interface ViewInstance {
  resize?(width: number, height: number): void
  settingsChanged?(settings: Readonly<Record<string, unknown>>): void
  themeChanged?(theme: ViewTheme): void
  destroy?(): void
}

export interface ViewDefinition {
  id: string
  title?: string
  description?: string
  inputs: ViewInputSpec[]
  settings?: Record<string, ViewSettingSpec>
  /** Initial size in px when placed by a host. */
  size?: { width: number; height: number }
  suits?: ViewSuit[]
  mount(element: HTMLElement, context: ViewContext): ViewInstance | void
}

export interface DefinedView extends ViewDefinition {
  sdk: number
}

/** Typed authoring for views built with the package (plugin modules write the object with `sdk: 1` themselves). */
export function defineView(definition: ViewDefinition): DefinedView {
  return { sdk: VIEW_SDK_VERSION, ...definition }
}

/** What a view declares, without its code (built-in views are listed in this form). */
export type ViewMetadata = Omit<ViewDefinition, 'mount'>

/** A view as listed in `<plugin>/static/views/manifest.json`: its metadata and module. */
export type ViewManifestEntry = ViewMetadata & {
  /** Module path relative to the manifest. */
  module: string
}

/** `<plugin>/static/views/manifest.json`, generated from the modules (data only). */
export interface ViewManifest {
  sdk: number
  views: ViewManifestEntry[]
}

// --- type matching -----------------------------------------------------------------------

function parseType(type: string): { dtype: string; dims: string[] } {
  const match = /^([a-z0-9]+)(?:\[(.*)\])?$/.exec(type.trim())
  if (!match) return { dtype: type.trim(), dims: [] }
  return { dtype: match[1], dims: match[2] ? match[2].split('x') : [] }
}

/**
 * Whether a port type (as the engine reports it, e.g. "u8[180x320]",
 * "f32[?x?x2]") is accepted by a pattern ("u8[?x?]", "f32[?]", "any",
 * "f32[*]" for any rank).
 */
export function typeAccepts(pattern: string, portType: string): boolean {
  if (pattern === 'any') return true
  const p = parseType(pattern)
  const t = parseType(portType)
  if (p.dtype !== 'any' && p.dtype !== t.dtype) return false
  if (p.dims.length === 1 && p.dims[0] === '*') return true
  if (p.dims.length !== t.dims.length) return false
  for (let i = 0; i < p.dims.length; ++i) {
    if (p.dims[i] !== '?' && p.dims[i] !== t.dims[i]) return false
  }
  return true
}

export function inputAccepts(input: ViewInputSpec, portType: string): boolean {
  for (let i = 0; i < input.accepts.length; ++i) if (typeAccepts(input.accepts[i], portType)) return true
  return false
}
