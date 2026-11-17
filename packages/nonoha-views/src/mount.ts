import type {
  GraphClient,
  InspectorClient,
  InspectorPortRef,
  PortData,
  WatchHandle,
  WatchOptions,
} from 'nonoha-client-js'
import type { ViewEntry } from './catalog'
import { loadView } from './catalog'
import type { ViewHost } from './host'
import { createViewHost, defaultViewTheme, watchOptionsFor } from './host'
import type { DefinedView, ViewTheme } from './sdk'

/** Where a view reads graph outputs (e.g. the app's GraphClient). */
export type OutputSource = Pick<GraphClient, 'addOutputCallback' | 'removeOutputCallback' | 'fetchOutputValues'>
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
 * connections). The view follows the element's size.
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

  const byPort = new Map<string, string[]>()
  const watches: WatchHandle[] = []
  for (const input in bindings) {
    const binding = bindings[input]
    if (typeof binding === 'string') {
      byPort.set(binding, (byPort.get(binding) ?? []).concat(input))
      continue
    }
    const { watch, ...ref } = binding
    const spec = definition.inputs.find(i => i.name === input)
    const watchOptions = watch ?? (spec ? watchOptionsFor(spec) : { intervalMs: 100, batch: 'last' as const })
    watches.push(
      samples!.watch(ref, watchOptions, {
        onSample: sample => {
          if (sample.values) host.deliver(input, sample.values)
        },
      }),
    )
  }

  // Ports that delivered a live value: the first fetch must not overwrite it.
  const live = new Set<string>()
  const onOutput = (output: PortData) => {
    const inputs = byPort.get(output.portName)
    if (!inputs) return
    live.add(output.portName)
    for (let i = 0; i < inputs.length; ++i) host.deliver(inputs[i], output.values)
  }
  if (outputs && byPort.size > 0) {
    outputs.addOutputCallback(onOutput)
    // Show the current value right away (outputs only arrive on change).
    byPort.forEach((inputs, port) => {
      outputs
        .fetchOutputValues(port)
        .then(values => {
          if (live.has(port)) return
          for (let i = 0; i < inputs.length; ++i) host.deliver(inputs[i], values)
        })
        .catch(() => {})
    })
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
      if (outputs) outputs.removeOutputCallback(onOutput)
      for (let i = 0; i < watches.length; ++i) watches[i].unwatch()
      host.destroy()
    },
  }
}
