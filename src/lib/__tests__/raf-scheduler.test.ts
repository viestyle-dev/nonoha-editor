import { describe, expect, it, vi } from "vitest"

import { createFrameScheduler, FrameSchedulerEnv } from "@/src/lib/raf-scheduler"

// Manual frame clock + visibility switch.
function fakeEnv() {
  let nextHandle = 1
  const frames = new Map<number, () => void>()
  const listeners = new Set<() => void>()
  let hidden = false
  const env: FrameSchedulerEnv = {
    requestFrame: cb => {
      const h = nextHandle++
      frames.set(h, cb)
      return h
    },
    cancelFrame: h => {
      frames.delete(h)
    },
    isHidden: () => hidden,
    onVisibilityChange: l => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  return {
    env,
    get pendingFrames() {
      return frames.size
    },
    get listenerCount() {
      return listeners.size
    },
    tick() {
      const due = Array.from(frames.values())
      frames.clear()
      due.forEach(cb => cb())
    },
    setHidden(value: boolean) {
      hidden = value
      listeners.forEach(l => l())
    },
  }
}

describe("createFrameScheduler", () => {
  it("coalesces many schedules into one paint per frame", () => {
    const clock = fakeEnv()
    const paint = vi.fn()
    const s = createFrameScheduler(paint, clock.env)
    for (let i = 0; i < 100; i++) s.schedule()
    expect(clock.pendingFrames).toBe(1)
    expect(paint).not.toHaveBeenCalled()
    clock.tick()
    expect(paint).toHaveBeenCalledTimes(1)
    // Nothing new scheduled -> no further paints.
    clock.tick()
    expect(paint).toHaveBeenCalledTimes(1)
    s.schedule()
    clock.tick()
    expect(paint).toHaveBeenCalledTimes(2)
  })

  it("allows a paint to schedule the next frame", () => {
    const clock = fakeEnv()
    let count = 0
    const s = createFrameScheduler(() => {
      count++
      if (count < 3) s.schedule()
    }, clock.env)
    s.schedule()
    clock.tick()
    clock.tick()
    clock.tick()
    clock.tick()
    expect(count).toBe(3)
  })

  it("holds paints while hidden and catches up once when visible", () => {
    const clock = fakeEnv()
    const paint = vi.fn()
    const s = createFrameScheduler(paint, clock.env)
    s.schedule()
    clock.setHidden(true) // cancels the pending frame
    expect(clock.pendingFrames).toBe(0)
    for (let i = 0; i < 10; i++) s.schedule()
    expect(clock.pendingFrames).toBe(0)
    clock.tick()
    expect(paint).not.toHaveBeenCalled()
    clock.setHidden(false)
    expect(clock.pendingFrames).toBe(1)
    clock.tick()
    expect(paint).toHaveBeenCalledTimes(1)
  })

  it("does not paint if the page went hidden before the frame fired", () => {
    const clock = fakeEnv()
    const paint = vi.fn()
    const s = createFrameScheduler(paint, clock.env)
    s.schedule()
    // Simulate a frame firing while hidden without a visibility event.
    const env = clock.env as { isHidden: () => boolean }
    const original = env.isHidden
    env.isHidden = () => true
    clock.tick()
    expect(paint).not.toHaveBeenCalled()
    expect(s.dirty).toBe(true)
    env.isHidden = original
  })

  it("flush paints synchronously only when dirty; cancel drops the paint", () => {
    const clock = fakeEnv()
    const paint = vi.fn()
    const s = createFrameScheduler(paint, clock.env)
    s.flush()
    expect(paint).not.toHaveBeenCalled()
    s.schedule()
    s.flush()
    expect(paint).toHaveBeenCalledTimes(1)
    expect(clock.pendingFrames).toBe(0)
    s.schedule()
    s.cancel()
    clock.tick()
    expect(paint).toHaveBeenCalledTimes(1)
    expect(s.pending).toBe(false)
  })

  it("keeps working after a paint throws", () => {
    const clock = fakeEnv()
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    let calls = 0
    const s = createFrameScheduler(() => {
      calls++
      if (calls === 1) throw new Error("boom")
    }, clock.env)
    s.schedule()
    clock.tick()
    s.schedule()
    clock.tick()
    expect(calls).toBe(2)
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })

  it("dispose cancels, unsubscribes and ignores later schedules", () => {
    const clock = fakeEnv()
    const paint = vi.fn()
    const s = createFrameScheduler(paint, clock.env)
    expect(clock.listenerCount).toBe(1)
    s.schedule()
    s.dispose()
    expect(clock.pendingFrames).toBe(0)
    expect(clock.listenerCount).toBe(0)
    s.schedule()
    clock.tick()
    expect(paint).not.toHaveBeenCalled()
  })
})
