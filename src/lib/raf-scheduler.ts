// Coalesces "something changed, repaint" requests into at most one paint per
// animation frame, and holds paints while the document (or, with
// elementFrameEnv, the painted element) is hidden: one catch-up paint runs
// when it becomes visible again.
//
// The environment (frame request, visibility) is injected so the logic is
// unit-testable without a DOM; browserFrameEnv() is the real one.

export interface FrameSchedulerEnv {
  requestFrame(callback: () => void): number
  cancelFrame(handle: number): void
  isHidden(): boolean
  /** Subscribes to visibility changes; returns an unsubscribe function. */
  onVisibilityChange(listener: () => void): () => void
}

export interface FrameScheduler {
  /** Marks the view dirty and requests a frame (no-op if one is pending). */
  schedule(): void
  /** Paints now if dirty (cancelling the pending frame). */
  flush(): void
  /** Drops a pending paint. */
  cancel(): void
  /** Cancels and stops listening; later schedule() calls are ignored. */
  dispose(): void
  readonly dirty: boolean
  readonly pending: boolean
}

export function createFrameScheduler(
  paint: () => void,
  env: FrameSchedulerEnv,
): FrameScheduler {
  let dirty = false
  let handle: number | null = null
  let disposed = false

  const run = () => {
    handle = null
    if (disposed || !dirty) return
    if (env.isHidden()) return // keep dirty; repaint on visibility
    dirty = false
    try {
      paint()
    } catch (error) {
      // A failing paint must not wedge the scheduler for later frames.
      console.error("Frame paint failed", error)
    }
  }

  const request = () => {
    if (handle === null && !disposed && !env.isHidden()) {
      handle = env.requestFrame(run)
    }
  }

  const cancelPending = () => {
    if (handle !== null) {
      env.cancelFrame(handle)
      handle = null
    }
  }

  const unsubscribe = env.onVisibilityChange(() => {
    if (env.isHidden()) {
      cancelPending()
    } else if (dirty) {
      request()
    }
  })

  return {
    schedule() {
      if (disposed) return
      dirty = true
      request()
    },
    flush() {
      cancelPending()
      run()
    },
    cancel() {
      cancelPending()
      dirty = false
    },
    dispose() {
      if (disposed) return
      cancelPending()
      dirty = false
      disposed = true
      unsubscribe()
    },
    get dirty() {
      return dirty
    },
    get pending() {
      return handle !== null
    },
  }
}

// browserFrameEnv, also hidden while `element` is off screen (scrolled or
// panned away): a canvas that repaints there still costs the browser a frame
// of compositing. Without IntersectionObserver it is browserFrameEnv.
export function elementFrameEnv(element: Element): FrameSchedulerEnv {
  const page = browserFrameEnv()
  if (typeof IntersectionObserver === "undefined") return page
  let onScreen = true
  return {
    requestFrame: page.requestFrame,
    cancelFrame: page.cancelFrame,
    isHidden: () => !onScreen || page.isHidden(),
    onVisibilityChange: listener => {
      const offPage = page.onVisibilityChange(listener)
      const observer = new IntersectionObserver(entries => {
        const next = entries[entries.length - 1].isIntersecting
        if (next === onScreen) return
        onScreen = next
        listener()
      })
      observer.observe(element)
      return () => {
        offPage()
        observer.disconnect()
      }
    },
  }
}

// requestAnimationFrame + Page Visibility; falls back to a ~60 Hz timer
// where rAF is unavailable (SSR, tests).
export function browserFrameEnv(): FrameSchedulerEnv {
  const hasRaf = typeof requestAnimationFrame === "function"
  const hasDocument = typeof document !== "undefined"
  return {
    requestFrame: callback =>
      hasRaf
        ? requestAnimationFrame(() => callback())
        : (setTimeout(callback, 16) as unknown as number),
    cancelFrame: handle =>
      hasRaf ? cancelAnimationFrame(handle) : clearTimeout(handle),
    isHidden: () => hasDocument && document.visibilityState === "hidden",
    onVisibilityChange: listener => {
      if (!hasDocument) return () => {}
      document.addEventListener("visibilitychange", listener)
      return () => document.removeEventListener("visibilitychange", listener)
    },
  }
}
