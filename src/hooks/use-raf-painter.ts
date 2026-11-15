"use client"

import { useEffect, useMemo, useRef } from "react"

import {
  browserFrameEnv,
  createFrameScheduler,
  FrameScheduler,
} from "@/src/lib/raf-scheduler"

export type RafPainter = Pick<FrameScheduler, "schedule" | "flush" | "cancel">

/**
 * Decouples data arrival from drawing: call `schedule()` from every data
 * update (cheap), and `paint` runs at most once per animation frame with
 * whatever the latest state is. Paints are held while the tab is hidden and
 * one catch-up paint runs when it becomes visible.
 *
 * `paint` may change between renders; the latest one is always used. The
 * returned object is stable for the component's lifetime.
 */
export function useRafPainter(paint: () => void): RafPainter {
  const paintRef = useRef(paint)
  paintRef.current = paint

  const schedulerRef = useRef<FrameScheduler | null>(null)

  useEffect(() => {
    return () => {
      schedulerRef.current?.dispose()
      schedulerRef.current = null
    }
  }, [])

  return useMemo<RafPainter>(() => {
    // Created lazily so nothing touches `document` during SSR, and
    // recreated if a StrictMode unmount/remount disposed it.
    const get = () => {
      if (!schedulerRef.current) {
        schedulerRef.current = createFrameScheduler(
          () => paintRef.current(),
          browserFrameEnv(),
        )
      }
      return schedulerRef.current
    }
    return {
      schedule: () => get().schedule(),
      flush: () => get().flush(),
      cancel: () => schedulerRef.current?.cancel(),
    }
  }, [])
}
