import type { GraphClient, InspectorClient, InspectorPortRef, WatchHandle, WatchOptions } from 'nonoha-client-js'
import type { ViewEntry } from './catalog'
import { loadView } from './catalog'
import type { ViewHost } from './host'
import { createViewHost, defaultViewTheme, watchOptionsFor } from './host'
import type { DefinedView, ViewTheme } from './sdk'

/** Where a view reads graph outputs (e.g. the app's GraphClient). */
export type OutputSource = Pick<GraphClient, 'subscribeOutput'>
/** Where a view samples internal ports (e.g. the app's InspectorClient). */
export type SampleSource = Pick<InspectorClient, 'watch'>

/** Where an input's values come from: a graph output port (all values), or an internal port via the inspector (sampled). */
export type ViewBinding = string | (InspectorPortRef & { watch?: WatchOptions })

export interface MountViewOptions {
  /** input name -> output port name, or an internal port. */
  bindings: Record<string, ViewBinding>
  /** Needed for output-port bindings. The caller connects and closes it. */
  outputs?: OutputSource
  /** Needed for internal-port bindings. The caller connects and closes it. */
  samples?: SampleSource
  settings?: Record<string, unknown>
  theme?: ViewTheme
  onError?: (error: unknown) => void
}

export interface MountedView {
  host: ViewHost
  unmount(): void
}

/**
 * Show a view (a catalog entry or a definition) in `element`, fed from a
 * graph through the clients the caller passes (it never opens or closes
 * connections). Inputs get what they declare (`delivery`): "latest" ones
 * see the current value first. The view follows the element's size.
 */
export async function mountView(
  view: ViewEntry | DefinedView,
  element: HTMLElement,
  options: MountViewOptions,
): Promise<MountedView> {
  const { bindings, outputs, samples } = options
  for (const input in bindings) {
    const byPort = typeof bindings[input] === 'string'
    if (byPort ? !outputs : !samples) throw new Error(`binding "${input}" needs options.${byPort ? 'outputs' : 'samples'}`)
  }
  const definition = 'mount' in view ? view : await loadView(view)
  const rect = element.getBoundingClientRect()
  const host = createViewHost(definition, element, {
    theme: options.theme ?? defaultViewTheme(true),
    settings: options.settings,
    size: { width: rect.width, height: rect.height },
    onError: options.onError,
  })

  const stops: (() => void)[] = []
  const watches: WatchHandle[] = []
  for (const input in bindings) {
    const binding = bindings[input]
    const spec = definition.inputs.find(i => i.name === input) ?? { name: input, accepts: ['any'] }
    if (typeof binding === 'string') {
      stops.push(
        outputs!.subscribeOutput(binding, values => host.deliver(input, values), {
          current: spec.delivery === 'latest',
          onError: options.onError,
        }),
      )
      continue
    }
    const { watch, ...ref } = binding
    watches.push(
      samples!.watch(ref, watch ?? watchOptionsFor(spec), {
        onSample: sample => {
          if (sample.values) host.deliver(input, sample.values)
        },
      }),
    )
  }

  const observer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(entries => {
          const box = entries[entries.length - 1].contentRect
          host.resize(box.width, box.height)
        })
      : null
  observer?.observe(element)

  return {
    host,
    unmount() {
      observer?.disconnect()
      for (let i = 0; i < stops.length; ++i) stops[i]()
      for (let i = 0; i < watches.length; ++i) watches[i].unwatch()
      host.destroy()
    },
  }
}
