"use client"

import { css, keyframes } from "@emotion/react"
import { ReactFlowState, useOnViewportChange, useStore } from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * The ring that breathes around a port while values flow through it.
 *
 * Every ring breathes in one phase (a calm pulse across the graph rather than
 * scattered blinking): a ring that starts gets a negative animation-delay from
 * one shared clock. The clock and every ring pause together while the
 * breathing cannot be seen (zoomed out, the ring under 2 px) and while the
 * viewport moves: any running animation in the graph costs a frame each
 * refresh. The ring fades in and out (0.3 s) when the port starts or stops.
 *
 * The ring is a pseudo-element whose opacity animates: the compositor runs
 * opacity animations without the main thread. Animating box-shadow
 * recalculated styles and repainted every flowing port on every frame.
 */

const BREATHE_MS = 1600
const PAUSED_CLASS = "breath-paused"
/** Below this zoom the 4 px ring is under 2 px on screen. */
const VISIBLE_ZOOM = 0.5

const breathe = keyframes`
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
`

/**
 * For an element that is positioned, carries `--port-glow` (the ring color)
 * and `--breathe-delay` (from useBreatheDelay), and `data-flowing` while
 * values flow.
 */
export const portRing = css({
  "&::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    pointerEvents: "none",
    opacity: 0.7,
    boxShadow: "0 0 0 4px transparent",
    transition: "box-shadow 0.3s ease-out",
  },
  "&[data-flowing]::after": {
    boxShadow: "0 0 0 4px var(--port-glow)",
    animation: `${breathe} ${BREATHE_MS}ms ease-in-out var(--breathe-delay, 0ms) infinite`,
  },
  [`.${PAUSED_CLASS} &[data-flowing]::after`]: { animationPlayState: "paused" },
  "@media (prefers-reduced-motion: reduce)": {
    "&[data-flowing]::after": { animation: "none" },
  },
})

// The shared clock: the time the rings have been breathing (paused time excluded).
let pausedSince: number | null = null
let pausedTotal = 0

function breathTime(): number {
  return (pausedSince ?? performance.now()) - pausedTotal
}

/** `--breathe-delay` for a ring: in phase with every other ring when it starts flowing. */
export function useBreatheDelay(flowing: boolean): string | undefined {
  return useMemo(() => (flowing ? `${-(breathTime() % BREATHE_MS)}ms` : undefined), [flowing])
}

function setPaused(domNode: HTMLElement, paused: boolean): void {
  if (paused === (pausedSince !== null)) return
  const now = performance.now()
  if (paused) pausedSince = now
  else {
    pausedTotal += now - (pausedSince ?? now)
    pausedSince = null
  }
  domNode.classList.toggle(PAUSED_CLASS, paused)
}

const zoomedOutSelector = (s: ReactFlowState) => s.transform[2] < VISIBLE_ZOOM
const domNodeSelector = (s: ReactFlowState) => s.domNode

/** Pauses every ring while zoomed out or while the viewport moves. Render inside <ReactFlow>. */
export function BreathPauser() {
  const domNode = useStore(domNodeSelector)
  const zoomedOut = useStore(zoomedOutSelector)
  const [moving, setMoving] = useState(false)
  const onStart = useCallback(() => setMoving(true), [])
  const onEnd = useCallback(() => setMoving(false), [])
  useOnViewportChange({ onStart, onEnd })
  const paused = zoomedOut || moving
  useEffect(() => {
    if (!domNode) return
    setPaused(domNode, paused)
  }, [domNode, paused])
  useEffect(() => {
    if (!domNode) return
    return () => setPaused(domNode, false)
  }, [domNode])
  return null
}
