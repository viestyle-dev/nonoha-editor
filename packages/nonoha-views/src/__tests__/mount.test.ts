import type { InspectorPortRef, PortData, PortValue, WatchCallbacks, WatchOptions } from 'nonoha-client-js'
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
      { name: 'level', accepts: ['f32'] },
      { name: 'image', accepts: ['u8[?x?x3]'] },
    ],
    mount(_el, ctx) {
      context = ctx
      for (const input of ['level', 'image']) {
        ctx.onValues(input, values => received.push([input, (values[0].array as Float32Array)[0]]))
      }
    },
  })
  return { view, received, context: () => context }
}

function fakeOutputs() {
  const callbacks = new Set<(output: PortData) => void>()
  const fetches = new Map<string, (values: PortValue[]) => void>()
  const outputs: OutputSource = {
    addOutputCallback: cb => void callbacks.add(cb),
    removeOutputCallback: cb => void callbacks.delete(cb),
    fetchOutputValues: port => new Promise(resolve => fetches.set(port, resolve)),
  }
  const emit = (portName: string, values: PortValue[]) => callbacks.forEach(cb => cb({ portName, values } as PortData))
  return { outputs, callbacks, fetches, emit }
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
  it('feeds output bindings through the given client and shows the current value first', async () => {
    const { view, received } = recordingView()
    const out = fakeOutputs()
    const mounted = await mountView(view, fakeElement(), { bindings: { level: 'level_out' }, outputs: out.outputs })
    out.fetches.get('level_out')!([f32(1)])
    await Promise.resolve()
    out.emit('level_out', [f32(2)])
    out.emit('other', [f32(9)])
    expect(received).toEqual([
      ['level', 1],
      ['level', 2],
    ])
    mounted.unmount()
    expect(out.callbacks.size).toBe(0)
  })

  it('drops the first fetch when a live value came before it', async () => {
    const { view, received } = recordingView()
    const out = fakeOutputs()
    await mountView(view, fakeElement(), { bindings: { level: 'level_out' }, outputs: out.outputs })
    out.emit('level_out', [f32(5)])
    out.fetches.get('level_out')!([f32(1)]) // older than the live value
    await Promise.resolve()
    expect(received).toEqual([['level', 5]])
  })

  it('samples internal ports with the shared watch options, and unwatches on unmount', async () => {
    const { view, received } = recordingView()
    const s = fakeSamples()
    const ref = { node: 'Grid_1', dir: 'out', port: 'out' } satisfies InspectorPortRef
    const mounted = await mountView(view, fakeElement(), { bindings: { image: ref }, samples: s.samples })
    expect(s.watches.length).toBe(1)
    expect(s.watches[0].ref).toEqual(ref)
    expect(s.watches[0].options.batch).toBe('last') // 2-D+ input
    s.watches[0].callbacks.onSample({ values: [f32(3)] } as Parameters<WatchCallbacks['onSample']>[0])
    expect(received).toEqual([['image', 3]])
    mounted.unmount()
    expect(s.watches[0].unwatched).toBe(true)
  })

  it('refuses bindings without their client, and never offers a write path', async () => {
    const { view, context } = recordingView()
    await expect(mountView(view, fakeElement(), { bindings: { level: 'level_out' } })).rejects.toThrow(/outputs/)
    await expect(
      mountView(view, fakeElement(), { bindings: { image: { node: 'n', port: 'p' } as unknown as InspectorPortRef } }),
    ).rejects.toThrow(/samples/)
    await mountView(view, fakeElement(), { bindings: {} })
    expect('dispatch' in context()).toBe(false)
  })
})
