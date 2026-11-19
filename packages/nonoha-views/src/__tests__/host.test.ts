import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createViewHost, defaultViewTheme, resolveSettings, watchOptionsFor } from '../host'
import { defineView, VIEW_SDK_VERSION, type ViewContext, type ViewSettingSpec } from '../sdk'
import { f32, fakeElement } from './helpers'

const element = fakeElement()
const theme = defaultViewTheme(true)
const size = { width: 10, height: 10 }

describe('resolveSettings', () => {
  const specs: Record<string, ViewSettingSpec> = {
    gain: { type: 'number', default: 2, min: 0, max: 10 },
    free: { type: 'number' },
    log: { type: 'boolean', default: true },
    map: { type: 'string', default: 'viridis', enum: ['viridis', 'gray'] },
    label: { type: 'string' },
  }

  it('fills defaults and drops unset settings without one', () => {
    expect(resolveSettings(specs, {})).toEqual({ gain: 2, log: true, map: 'viridis' })
    expect(resolveSettings(specs, undefined)).toEqual({ gain: 2, log: true, map: 'viridis' })
  })

  it('parses strings from text fields and clamps to min/max', () => {
    expect(resolveSettings(specs, { gain: '4.5', free: '-3', log: 'false', label: 7 })).toEqual({
      gain: 4.5,
      free: -3,
      log: false,
      map: 'viridis',
      label: '7',
    })
    expect(resolveSettings(specs, { gain: 50 }).gain).toBe(10)
    expect(resolveSettings(specs, { gain: '-1' }).gain).toBe(0)
  })

  it('falls back to the default on values that do not fit', () => {
    expect(resolveSettings(specs, { gain: 'abc', free: '', log: 'yes', map: 'jet' })).toEqual({
      gain: 2,
      log: true,
      map: 'viridis',
    })
    expect(resolveSettings(specs, { gain: Infinity }).gain).toBe(2)
  })

  it('passes undeclared settings through', () => {
    expect(resolveSettings(specs, { extra: { a: 1 } }).extra).toEqual({ a: 1 })
    expect(resolveSettings(undefined, { a: 1, b: undefined })).toEqual({ a: 1 })
  })
})

describe('createViewHost', () => {
  let frames: (() => void)[] = []
  beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('feeds values, coalesces frames and hands resolved settings to the view', () => {
    const seen: number[] = []
    let draws = 0
    const view = defineView({
      id: 't',
      inputs: [{ name: 'x', accepts: ['f32'] }],
      settings: { gain: { type: 'number', default: 2, max: 5 } },
      mount(_el, ctx) {
        ctx.onValues('x', values => {
          seen.push((values[0].array as Float32Array)[0] * (ctx.settings.gain as number))
          ctx.requestFrame(draw)
        })
        function draw() {
          draws++
        }
      },
    })
    expect(view.sdk).toBe(VIEW_SDK_VERSION)
    const host = createViewHost(view, element, { theme, size })
    host.deliver('x', [f32(1)])
    host.deliver('x', [f32(2)])
    host.deliver('other', [f32(3)]) // no listener: ignored
    expect(seen).toEqual([2, 4])
    expect(frames.length).toBe(1)
    frames.shift()!()
    expect(draws).toBe(1)
    host.setSettings({ gain: '10' }) // text from an input field, above max
    host.deliver('x', [f32(1)])
    expect(seen[2]).toBe(5)
  })

  it('runs a draw requested during a frame on the next frame', () => {
    const order: string[] = []
    let ctx!: ViewContext
    createViewHost(
      defineView({
        id: 'f',
        inputs: [],
        mount(_el, context) {
          ctx = context
        },
      }),
      element,
      { theme, size },
    )
    const again = () => order.push('again')
    const first = () => {
      order.push('first')
      ctx.requestFrame(again)
    }
    ctx.requestFrame(first)
    ctx.requestFrame(first) // same draw: once
    expect(frames.length).toBe(1)
    frames.shift()!()
    expect(order).toEqual(['first'])
    expect(frames.length).toBe(1)
    frames.shift()!()
    expect(order).toEqual(['first', 'again'])
    for (let i = 0; i < 100; ++i) {
      ctx.requestFrame(again)
      frames.shift()!()
    }
    expect(order.length).toBe(102)
    expect(frames.length).toBe(0)
  })

  it('reports view errors instead of throwing, and cleans up on destroy', () => {
    const errors: unknown[] = []
    let destroyed = false
    let ctx!: ViewContext
    const view = defineView({
      id: 'bad',
      inputs: [],
      mount(_el, context) {
        ctx = context
        ctx.onValues('x', () => {
          throw new Error('boom')
        })
        return { destroy: () => (destroyed = true) }
      },
    })
    const host = createViewHost(view, element, { theme: defaultViewTheme(false), size, onError: e => errors.push(e) })
    host.deliver('x', [f32(1)])
    expect(errors.length).toBe(1)
    ctx.requestFrame(() => {
      throw new Error('draw')
    })
    frames.shift()!()
    expect(errors.length).toBe(2)
    host.destroy()
    expect(destroyed).toBe(true)
    ctx.requestFrame(() => {})
    expect(frames.length).toBe(0) // nothing scheduled after destroy
  })

  it('holds draws while the element is off screen, and runs them when it shows', () => {
    let report!: (entries: { isIntersecting: boolean }[]) => void
    const observed: unknown[] = []
    let disconnected = 0
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof report) {
          report = callback
        }
        observe(target: unknown) {
          observed.push(target)
        }
        disconnect() {
          disconnected++
        }
      },
    )
    const seen: number[] = []
    let draws = 0
    let ctx!: ViewContext
    const draw = () => {
      draws++
    }
    const view = defineView({
      id: 'o',
      inputs: [{ name: 'x', accepts: ['f32'] }],
      mount(_el, context) {
        ctx = context
        context.onValues('x', values => {
          seen.push((values[0].array as Float32Array)[0])
          context.requestFrame(draw)
        })
      },
    })
    const host = createViewHost(view, element, { theme, size })
    expect(observed).toEqual([element])
    report([{ isIntersecting: false }])
    host.deliver('x', [f32(1)])
    host.deliver('x', [f32(2)])
    expect(seen).toEqual([1, 2]) // values keep arriving
    expect(frames.length).toBe(0)
    report([{ isIntersecting: true }])
    expect(frames.length).toBe(1)
    frames.shift()!()
    expect(draws).toBe(1)
    // Off screen between the request and the frame: the draw waits.
    ctx.requestFrame(draw)
    report([{ isIntersecting: false }])
    frames.shift()!()
    expect(draws).toBe(1)
    report([{ isIntersecting: true }])
    frames.shift()!()
    expect(draws).toBe(2)
    host.destroy()
    expect(disconnected).toBe(1)
  })

  it('gives views no way to write to a graph', () => {
    let ctx!: ViewContext
    const view = defineView({
      id: 'r',
      inputs: [],
      mount(_el, context) {
        ctx = context
      },
    })
    createViewHost(view, element, { theme, size })
    expect(Object.keys(ctx).sort()).toEqual(['onValues', 'requestFrame', 'settings', 'size', 'theme'])
  })

  it('refuses views built for another SDK version', () => {
    const view = { ...defineView({ id: 'v', inputs: [], mount() {} }), sdk: 99 }
    expect(() => createViewHost(view, element, { theme, size })).toThrow(/SDK/)
  })
})

describe('watchOptionsFor', () => {
  it('follows what the input declares, not its shape', () => {
    // The latest value is the latest dispatch, all its rows (a spectrum may carry its bins as rows).
    const latest = watchOptionsFor({ name: 'image', accepts: ['u8[?x?x3]'], delivery: 'latest' })
    expect(latest.batch).toBe('all')
    expect(latest.autoStride).toEqual([0, 1])
    expect(watchOptionsFor({ name: 'spectrum', accepts: ['f32'], delivery: 'latest' }).batch).toBe('all')
    // A block of audio frames is 2-D but every block counts.
    expect(watchOptionsFor({ name: 'frames', accepts: ['f32[?x?]'], delivery: 'every' }).batch).toBe('since')
    expect(watchOptionsFor({ name: 'any', accepts: ['f32[*]'] }).batch).toBe('since') // default: every
  })
})
