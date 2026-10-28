"use client"

import { useEffect, useRef, useState } from "react"
import { useHandleConnections, useNodesData } from "@xyflow/react"

import type { GraphEndpoint, PortData } from "nonoha-client-js"

import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import {
  controlSignalTypeError,
  lastTruthyOfValues,
  RisingEdgeGate,
} from "./control-gate-logic"

export type ControlGateMode = "auto" | "manual"

// Flow-driven control gates for chart nodes.
//
//   rec   handle: mirrors a bool state signal into the recording state
//                 (records only while true).
//   clear handle: fires onClear() only on the false -> true rising edge of a
//                 bool state signal (falling edges are ignored).
//
// Both handles use "state signal + edge detection" semantics (no pulses), so
// they can re-sync from a REST snapshot (current_values) after a WS
// disconnect or an editor reload. Typical setup: connect meditation_active to
// both rec and clear -> rising edge = clear plot + start recording / falling
// edge = stop recording (plot frozen for review). When the same port feeds
// both handles, a frame is processed in a fixed clear -> rec order (clear
// first, then start recording). Unconnected handles do nothing (manual
// operation as before).
//
// Control mode (only meaningful while a gate is connected):
//   AUTO   - the connected signals drive rec/clear (default; reset on reload).
//   MANUAL - port signals are ignored so already-captured data survives the
//            next session's clear edge; the user operates REC/Clear directly.
//            The rec signal keeps being tracked (lastRecValueRef + recSignal),
//            and clear edges keep being consumed by the RisingEdgeGate, so
//            returning to AUTO re-syncs recording to the live signal without
//            replaying missed clear edges (same semantics as the mid-window
//            prime on editor open).
export function useControlGates({
  graphEndpoint,
  onRecChange,
  onClear,
}: {
  graphEndpoint: GraphEndpoint | undefined
  onRecChange?: (recording: boolean) => void
  onClear?: () => void
}): {
  recConnected: boolean
  clearConnected: boolean
  // In-node error message when a connected source is neither bool nor numeric
  // (e.g. str). Restored edges are also detected on reload because
  // useNodesData is reactive.
  gateError: string | undefined
  mode: ControlGateMode
  setMode: (mode: ControlGateMode) => void
  // Live rec signal value, tracked in both modes. Used by the mode toggle to
  // show that a true signal is currently being ignored in MANUAL.
  recSignal: boolean | undefined
} {
  // ---
  const recConns = useHandleConnections({ type: "target", id: "rec" })
  const recSourceData = useNodesData<BasicPortNode>(recConns[0]?.source)
  const recPortName = recSourceData?.data.port.name
  const recPortNameRef = useRef<string | undefined>(undefined)
  recPortNameRef.current = recPortName
  // ---
  const clearConns = useHandleConnections({ type: "target", id: "clear" })
  const clearSourceData = useNodesData<BasicPortNode>(clearConns[0]?.source)
  const clearPortName = clearSourceData?.data.port.name
  const clearPortNameRef = useRef<string | undefined>(undefined)
  clearPortNameRef.current = clearPortName
  // ---

  const onRecChangeRef = useRef(onRecChange)
  onRecChangeRef.current = onRecChange
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  const clearGateRef = useRef(new RisingEdgeGate())
  // Once any WS frame has been processed, a late-arriving REST snapshot
  // (older value) must not overwrite the recording state.
  const recSeenRef = useRef(false)

  const [mode, setMode] = useState<ControlGateMode>("auto")
  const modeRef = useRef(mode)
  modeRef.current = mode

  // Latest rec signal value, tracked in both modes so returning to AUTO can
  // re-sync without waiting for the next dispatch.
  const lastRecValueRef = useRef<boolean | undefined>(undefined)
  const [recSignal, setRecSignal] = useState<boolean | undefined>(undefined)

  // WS subscription: one callback handles both handles (fixed clear -> rec order).
  useEffect(() => {
    if (!graphEndpoint) {
      return
    }
    const onOutputCallback = (output: PortData) => {
      if (clearPortNameRef.current === output.portName) {
        const value = lastTruthyOfValues(output.values)
        if (value !== undefined) {
          // Always update the gate: edges seen in MANUAL are consumed and
          // must not fire retroactively when returning to AUTO.
          const fired = clearGateRef.current.update(value)
          if (fired && modeRef.current === "auto") {
            onClearRef.current?.()
          }
        }
      }
      if (recPortNameRef.current === output.portName) {
        const value = lastTruthyOfValues(output.values)
        if (value !== undefined) {
          recSeenRef.current = true
          lastRecValueRef.current = value
          setRecSignal(value)
          if (modeRef.current === "auto") {
            onRecChangeRef.current?.(value)
          }
        }
      }
    }

    graphEndpoint.addOutputCallback(onOutputCallback)

    return () => {
      graphEndpoint.removeOutputCallback(onOutputCallback)
    }
  }, [graphEndpoint])

  // MANUAL -> AUTO: re-sync recording to the latest tracked signal value
  // (idempotent). Clear edges consumed during MANUAL are intentionally not
  // replayed - use the manual Clear button before returning if needed.
  const prevModeRef = useRef(mode)
  useEffect(() => {
    const prevMode = prevModeRef.current
    prevModeRef.current = mode
    if (
      prevMode === "manual" &&
      mode === "auto" &&
      lastRecValueRef.current !== undefined
    ) {
      onRecChangeRef.current?.(lastRecValueRef.current)
    }
  }, [mode])

  // rec initial prime: sync to the current value on connect, so opening the
  // editor mid-window immediately shows the correct recording state.
  useEffect(() => {
    recSeenRef.current = false
    // The tracked value belongs to the previous source - drop it so a stale
    // value is never applied on a MANUAL -> AUTO transition.
    lastRecValueRef.current = undefined
    setRecSignal(undefined)
    if (!graphEndpoint || !recPortName) {
      return
    }
    let cancelled = false
    graphEndpoint
      .fetchOutputValues(recPortName)
      .then(values => {
        if (cancelled || recSeenRef.current) {
          return
        }
        const value = lastTruthyOfValues(values)
        if (value !== undefined) {
          lastRecValueRef.current = value
          setRecSignal(value)
          if (modeRef.current === "auto") {
            onRecChangeRef.current?.(value)
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [graphEndpoint, recPortName])

  // clear initial prime: only records the current value, never fires
  // (opening the editor mid-window must not clear the plot).
  useEffect(() => {
    clearGateRef.current.reset()
    if (!graphEndpoint || !clearPortName) {
      return
    }
    let cancelled = false
    graphEndpoint
      .fetchOutputValues(clearPortName)
      .then(values => {
        if (cancelled) {
          return
        }
        clearGateRef.current.prime(lastTruthyOfValues(values))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [graphEndpoint, clearPortName])

  // With no gate connected the toggle is hidden and the node is always
  // manual; reset so a later reconnect starts in AUTO again.
  const anyGateConnected =
    recPortName !== undefined || clearPortName !== undefined
  useEffect(() => {
    if (!anyGateConnected) {
      setMode("auto")
    }
  }, [anyGateConnected])

  const recType =
    recPortName !== undefined
      ? recSourceData?.data.port.values?.[0]?.type
      : undefined
  const clearType =
    clearPortName !== undefined
      ? clearSourceData?.data.port.values?.[0]?.type
      : undefined
  const gateErrors = [
    controlSignalTypeError("rec", recType),
    controlSignalTypeError("clear", clearType),
  ].filter((e): e is string => e !== undefined)

  return {
    recConnected: recPortName !== undefined,
    clearConnected: clearPortName !== undefined,
    gateError: gateErrors.length > 0 ? gateErrors.join("\n") : undefined,
    mode,
    setMode,
    recSignal,
  }
}
