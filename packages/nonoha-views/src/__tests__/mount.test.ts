import type { InspectorPortRef, OutputSubscriptionOptions, PortValue, WatchCallbacks, WatchOptions } from 'nonoha-client-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView, type OutputSource, type SampleSource } from '../mount'
import { defineView, type ViewContext } from '../sdk'
import { f32, fakeElement } from './helpers'

function recordingView() {
  const received: [string, number][] = []
  let context!: ViewContext
  const view = defineView({
    id: 'rec',
    inputs: [
      { name: 'level', accepts: ['f32'], delivery: 'latest' },
      { name: 'onsets', accepts: ['f32'] },
      { name: 'image', accepts: ['u8[?x?x3]'], delivery: 'latest' },
    ],
    mount(_el, ctx) {
      context = ctx
      for (const input of ['level', 'onsets', 'image']) {
        ctx.onValues(input, values => received.push([input, (values[0].array as Float32Array)[0]]))
      }
    },
  })
  return { view, received, context: () => context }
}

/** Output subscriptions as a GraphClient keeps them (ports, callbacks, options). */
function fakeOutputs() {
  const subscriptions: {
    port: string
    callback: (values: PortValue[]) => void
    options?: OutputSubscriptionOptions
    stopped: boolean
  }[] = []
  const outputs: OutputSource = {
    subscribeOutput: (port, callback, options) => {
      const subscription = { port, callback, options, stopped: false }
      subscriptions.push(subscription)
      return () => void (subscription.stopped = true)
    },
  }
  const emit = (port: string, values: PortValue[]) =>
    subscriptions.forEach(s => !s.stopped && s.port === port && s.callback(values))
  return { outputs, subscriptions, emit }
}

function fakeSamples() {
  const watches: { ref: InspectorPortRef; options: WatchOptions; callbacks: WatchCallbacks; unwatched: boolean }[] = []
  const samples: SampleSource = {
    watch: (ref, options, callbacks) => {
      const watch = { ref, options, callbacks, unwatched: false }
      watches.push(watch)
      return { ref, unwatch: () => void (watch.unwatched = true) } as ReturnType<SampleSource['watch']>
    },
  }
  return { samples, watches }
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('mountView', () => {
  it('feeds output bindings through the given client, the current value for "latest" inputs only', async () => {
    const { view, received } = recordingView()
    const out = fakeOutputs()
    const mounted = await mountView(view, fakeElement(), {
      bindings: { level: 'level_out', onsets: 'onsets_out' },
      outputs: out.outputs,
    })
    expect(out.subscriptions.map(s => [s.port, s.options?.current])).toEqual([
      ['level_out', true],
      ['onsets_out', false],
    ])
    out.emit('level_out', [f32(2)])
    out.emit('onsets_out', [f32(1)])
    out.emit('other', [f32(9)])
    expect(received).toEqual([
      ['level', 2],
      ['onsets', 1],
    ])
    mounted.unmount()
    expect(out.subscriptions.every(s => s.stopped)).toBe(true)
  })

  it('samples internal ports as the input declares, and unwatches on unmount', async () => {
    const { view, received } = recordingView()
    const s = fakeSamples()
    const ref = { node: 'Grid_1', dir: 'out', port: 'out' } satisfies InspectorPortRef
    const mounted = await mountView(view, fakeElement(), {
      bindings: { image: ref, onsets: { ...ref, port: 'onsets' } },
      samples: s.samples,
    })
    expect(s.watches.map(w => w.options.batch)).toEqual(['all', 'since']) // latest, every
    s.watches[0].callbacks.onSample({ values: [f32(3)] } as Parameters<WatchCallbacks['onSample']>[0])
    expect(received).toEqual([['image', 3]])
    mounted.unmount()
    expect(s.watches.every(w => w.unwatched)).toBe(true)
  })

  it('tells the view how sampled values were reduced, and reports what the inspector could not send', async () => {
    const infos: { steps: unknown; gap: boolean }[] = []
    const view = defineView({
      id: 'info',
      inputs: [{ name: 'image', accepts: ['u8[?x?x3]'], delivery: 'latest' }, { name: 'level', accepts: ['f32'] }],
      mount(_el, ctx) {
        ctx.onValues('image', (_values, info) => infos.push({ steps: info.steps, gap: info.gap }))
        ctx.onValues('level', (_values, info) => infos.push({ steps: info.steps, gap: info.gap }))
      },
    })
    const s = fakeSamples()
    const out = fakeOutputs()
    const errors: string[] = []
    await mountView(view, fakeElement(), {
      bindings: { image: { node: 'Cam_1', dir: 'out', port: 'frame' }, level: 'level_out' },
      samples: s.samples,
      outputs: out.outputs,
      onError: e => errors.push(String((e as Error).message)),
    })
    const sample = { values: [f32(1)], steps: [[3, 3, 1]], flags: 0x10 } as unknown as Parameters<WatchCallbacks['onSample']>[0]
    s.watches[0].callbacks.onSample(sample)
    out.emit('level_out', [f32(2)]) // an output port's values are whole
    expect(infos).toEqual([
      { steps: [[3, 3, 1]], gap: true },
      { steps: [], gap: false },
    ])
    s.watches[0].callbacks.onError?.('too_large', 'u8[1x4000x4000x3]: 48000000 bytes, more than max_bytes 1048576 even reduced')
    s.watches[0].callbacks.onGone?.()
    expect(errors).toEqual([
      'image: u8[1x4000x4000x3]: 48000000 bytes, more than max_bytes 1048576 even reduced (too_large)',
      'image: the port Cam_1.frame is gone',
    ])
  })

  it('refuses bindings without their client, and never offers a write path', async () => {
    const { view, context } = recordingView()
    await expect(mountView(view, fakeElement(), { bindings: { level: 'level_out' } })).rejects.toThrow(/outputs/)
    await expect(mountView(view, fakeElement(), { bindings: { image: { node: 'n', dir: 'out', port: 'p' } } })).rejects.toThrow(
      /samples/,
    )
    await mountView(view, fakeElement(), { bindings: {} })
    expect('dispatch' in context()).toBe(false)
  })
})
