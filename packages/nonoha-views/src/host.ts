import type { PortValue, WatchOptions } from 'nonoha-client-js'
import type { DefinedView, ValuesInfo, ViewContext, ViewInputSpec, ViewInstance, ViewSettingSpec, ViewTheme } from './sdk'
import { VIEW_SDK_VERSION } from './sdk'

/** Values delivered whole (a graph output port): one shared object, nothing allocated per delivery. */
const WHOLE: ValuesInfo = Object.freeze({ steps: Object.freeze([]) as readonly (readonly number[])[], gap: false })

export interface ViewHost {
  /**
   * Push values for one input (valid during the call; the view copies what
   * it keeps). `info`: how a sampling host reduced them; omitted, they are whole.
   */
  deliver(input: string, values: PortValue[], info?: ValuesInfo): void
  resize(width: number, height: number): void
  setSettings(settings: Record<string, unknown>): void
  setTheme(theme: ViewTheme): void
  destroy(): void
}

export interface ViewHostOptions {
  theme: ViewTheme
  settings?: Record<string, unknown>
  size: { width: number; height: number }
  /** Errors thrown by the view (mount, callbacks, draw) end up here. */
  onError?: (error: unknown) => void
}

function resolveSetting(spec: ViewSettingSpec, value: unknown): unknown {
  if (spec.type === 'number') {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
    let number = Number.isFinite(parsed) ? parsed : typeof spec.default === 'number' ? spec.default : undefined
    if (number === undefined) return undefined
    if (spec.min !== undefined && number < spec.min) number = spec.min
    if (spec.max !== undefined && number > spec.max) number = spec.max
    return number
  }
  if (spec.type === 'boolean') {
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    return typeof spec.default === 'boolean' ? spec.default : undefined
  }
  const text = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
  if (text !== undefined && (!spec.enum || spec.enum.indexOf(text) >= 0)) return text
  return typeof spec.default === 'string' ? spec.default : undefined
}

/**
 * Settings as a view receives them: each declared setting parsed and
 * checked against its spec (defaults fill gaps); undeclared keys pass
 * through unchanged. Hosts call it once per change, never per frame.
 */
export function resolveSettings(
  specs: Readonly<Record<string, ViewSettingSpec>> | undefined,
  raw: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  if (raw) for (const key in raw) if (raw[key] !== undefined) out[key] = raw[key]
  if (specs) {
    for (const key in specs) {
      const value = resolveSetting(specs[key], raw ? raw[key] : undefined)
      if (value === undefined) delete out[key]
      else out[key] = value
    }
  }
  return out
}

/** Mount a view into `element`; the host feeds it values and size/theme/settings changes. */
export function createViewHost(view: DefinedView, element: HTMLElement, options: ViewHostOptions): ViewHost {
  if (view.sdk !== VIEW_SDK_VERSION) throw new Error(`view "${view.id}" needs view SDK ${view.sdk}, host has ${VIEW_SDK_VERSION}`)
  const listeners = new Map<string, ((values: PortValue[], info: ValuesInfo) => void)[]>()
  const report = options.onError ?? ((error: unknown) => console.error(`[view ${view.id}]`, error))
  let settings = resolveSettings(view.settings, options.settings)
  let theme = options.theme
  const size = { width: options.size.width, height: options.size.height }
  let frame: number | null = null
  // Draws requested for the next frame, and the list being run: swapped each
  // frame, so requesting and running never allocate.
  let pending: (() => void)[] = []
  let running: (() => void)[] = []
  let destroyed = false
  // Draws wait while the element is off screen (scrolled or panned away): a
  // canvas that redraws there still costs the browser a frame of compositing.
  // Values keep arriving, so the first frame back shows the latest state.
  let visible = true
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(entries => {
          visible = entries[entries.length - 1].isIntersecting
          if (visible && pending.length > 0 && frame === null && !destroyed) frame = requestAnimationFrame(runFrame)
        })

  const runFrame = () => {
    frame = null
    if (!visible) return // the draws stay pending until the element shows
    const draws = pending
    pending = running
    running = draws
    for (let i = 0; i < draws.length; ++i) {
      try {
        draws[i]()
      } catch (error) {
        report(error)
      }
    }
    draws.length = 0
  }

  const context: ViewContext = {
    onValues(input, callback) {
      const list = listeners.get(input) ?? []
      listeners.set(input, list.concat(callback))
      return () => {
        const current = listeners.get(input)
        if (current) listeners.set(input, current.filter(c => c !== callback))
      }
    },
    requestFrame(draw) {
      if (destroyed) return
      if (pending.indexOf(draw) < 0) pending.push(draw)
      if (frame === null && visible) frame = requestAnimationFrame(runFrame)
    },
    get settings() {
      return settings
    },
    get theme() {
      return theme
    },
    get size() {
      return size
    },
  }

  let instance: ViewInstance | void
  try {
    instance = view.mount(element, context)
  } catch (error) {
    report(error)
  }
  observer?.observe(element)

  return {
    deliver(input, values, info = WHOLE) {
      const list = listeners.get(input)
      if (!list) return
      for (let i = 0; i < list.length; ++i) {
        try {
          list[i](values, info)
        } catch (error) {
          report(error)
        }
      }
    },
    resize(width, height) {
      if (width === size.width && height === size.height) return
      size.width = width
      size.height = height
      instance?.resize?.(width, height)
    },
    setSettings(next) {
      settings = resolveSettings(view.settings, next)
      instance?.settingsChanged?.(settings)
    },
    setTheme(next) {
      theme = next
      instance?.themeChanged?.(next)
    },
    destroy() {
      destroyed = true
      observer?.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      pending.length = 0
      listeners.clear()
      try {
        instance?.destroy?.()
      } catch (error) {
        report(error)
      }
    },
  }
}

/** Theme for hosts without a design system of their own (e.g. apps). */
export function defaultViewTheme(isDark = true): ViewTheme {
  return isDark
    ? {
        isDark,
        background: '#111318',
        surface: '#1d2024',
        text: '#e2e2e9',
        textMuted: '#c4c6d0',
        grid: '#44474e',
        accent: '#b2c5ff',
        series: ['#7cb7ff', '#ffb870', '#7ad7a8', '#f48fb1', '#c5a3ff', '#ffe082', '#80deea', '#bcaaa4'],
        fontFamily: 'system-ui, sans-serif',
      }
    : {
        isDark,
        background: '#ffffff',
        surface: '#f3f3fa',
        text: '#1a1b20',
        textMuted: '#44474e',
        grid: '#c4c6d0',
        accent: '#3450c3',
        series: ['#1565c0', '#e65100', '#2e7d32', '#ad1457', '#6a1b9a', '#f9a825', '#00838f', '#5d4037'],
        fontFamily: 'system-ui, sans-serif',
      }
}

/** "every": every row since the last sample, within a byte budget. */
const EVERY_WATCH: Readonly<WatchOptions> = { intervalMs: 66, batch: 'since', maxBytes: 512 * 1024 }
/** "latest": the latest value (every row of the latest dispatch), strided to about 1 MiB (images, grids). */
const LATEST_WATCH: Readonly<WatchOptions> = { intervalMs: 66, batch: 'all', maxBytes: 1024 * 1024, autoStride: [0, 1] }

/**
 * Inspector options that give a view input what it declares it needs
 * (`delivery`), for hosts feeding it from an internal port. Hosts share it
 * so a view gets the same data everywhere.
 */
export function watchOptionsFor(input: ViewInputSpec): WatchOptions {
  return input.delivery === 'latest' ? LATEST_WATCH : EVERY_WATCH
}
