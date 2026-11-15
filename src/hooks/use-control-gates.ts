"use client"

import { useEffect, useRef, useState } from "react"
import { useNodesData } from "@xyflow/react"

import type { GraphEndpoint, PortValue } from "nonoha-client-js"

import type { BasicEngineNode } from "@/src/nodes/engine-nodes/basic-engine-node"
import type { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { EditorInputSource, useEditorInput } from "@/src/hooks/use-editor-input"
import {
  controlSignalTypeError,
  lastTruthyOfValues,
  RisingEdgeGate,
  updateGateWithRows,
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
// both handles, the clear edge and the recording change land in the same
// render (both only enqueue state updates, which React batches), so a session
// starts with a fresh plot. Unconnected handles do nothing (manual operation
// as before).
//
// A handle is fed by a solid edge ($output port: every value, primed from
// REST) or a dashed edge (engine node output sampled by the inspector with
// batch "since": every row since the last sample, so clear edges are not
// missed; the first sample primes). A dashed edge while the inspector is
// unavailable carries no signal and counts as unconnected.
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
  const onRecChangeRef = useRef(onRecChange)
  onRecChangeRef.current = onRecChange
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  const clearGateRef = useRef(new RisingEdgeGate())
  // Inspector samples hold several rows: every row is fed to the clear gate.
  const clearAllRowsRef = useRef(false)
  // Once any frame has been processed, a late-arriving REST snapshot (older
  // value) must not overwrite the recording state.
  const recSeenRef = useRef(false)

  const [mode, setMode] = useState<ControlGateMode>("auto")
  const modeRef = useRef(mode)
  modeRef.current = mode

  // Latest rec signal value, tracked in both modes so returning to AUTO can
  // re-sync without waiting for the next dispatch.
  const lastRecValueRef = useRef<boolean | undefined>(undefined)
  const [recSignal, setRecSignal] = useState<boolean | undefined>(undefined)

  // --- clear
  const clearSource = useEditorInput(graphEndpoint, "clear", (values: PortValue[]) => {
    // Always update the gate: edges seen in MANUAL are consumed and must not
    // fire retroactively when returning to AUTO.
    const fired = clearAllRowsRef.current
      ? updateGateWithRows(clearGateRef.current, values)
      : clearGateRef.current.update(lastTruthyOfValues(values))
    if (fired && modeRef.current === "auto") {
      onClearRef.current?.()
    }
  })
  clearAllRowsRef.current = clearSource.kind === "inspector"

  // --- rec
  const recSource = useEditorInput(graphEndpoint, "rec", (values: PortValue[]) => {
    const value = lastTruthyOfValues(values)
    if (value !== undefined) {
      recSeenRef.current = true
      lastRecValueRef.current = value
      setRecSignal(value)
      if (modeRef.current === "auto") {
        onRecChangeRef.current?.(value)
      }
    }
  })

  const recPortName = recSource.kind === "output" ? recSource.portName : undefined
  const recInspected = inspectedKey(recSource)
  const clearPortName = clearSource.kind === "output" ? clearSource.portName : undefined
  const clearInspected = inspectedKey(clearSource)

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
  // editor mid-window immediately shows the correct recording state (a dashed
  // edge is primed by its first inspector sample instead).
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
  }, [graphEndpoint, recPortName, recInspected])

  // clear initial prime: only records the current value, never fires
  // (opening the editor mid-window must not clear the plot). A dashed edge
  // needs no prime: the gate's first observation never fires.
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
  }, [graphEndpoint, clearPortName, clearInspected])

  const recConnected = recPortName !== undefined || recInspected !== undefined
  const clearConnected =
    clearPortName !== undefined || clearInspected !== undefined

  // With no gate connected the toggle is hidden and the node is always
  // manual; reset so a later reconnect starts in AUTO again.
  const anyGateConnected = recConnected || clearConnected
  useEffect(() => {
    if (!anyGateConnected) {
      setMode("auto")
    }
  }, [anyGateConnected])

  const recType = useSourceValueType(recSource)
  const clearType = useSourceValueType(clearSource)
  const gateErrors = [
    controlSignalTypeError("rec", recType),
    controlSignalTypeError("clear", clearType),
  ].filter((e): e is string => e !== undefined)

  return {
    recConnected,
    clearConnected,
    gateError: gateErrors.length > 0 ? gateErrors.join("\n") : undefined,
    mode,
    setMode,
    recSignal,
  }
}

// Identifies a live dashed-edge source (undefined otherwise, including while
// the inspector is unavailable and no signal can arrive).
function inspectedKey(source: EditorInputSource): string | undefined {
  return source.kind === "inspector" && source.available
    ? `${source.ref.node}.${source.ref.port}`
    : undefined
}

// Declared type ("bool", "f32[5]", ...) of the first value of the port that
// feeds a handle: from the $output port node for a solid edge, from the
// engine node's output for a dashed edge.
function useSourceValueType(source: EditorInputSource): string | undefined {
  const nodeId =
    source.kind === "output"
      ? `$output:${source.portName}`
      : source.kind === "inspector"
        ? source.ref.node
        : ""
  const node = useNodesData(nodeId)
  if (!node) {
    return undefined
  }
  if (source.kind === "output") {
    return (node.data as BasicPortNode["data"]).port?.values?.[0]?.type
  }
  if (source.kind === "inspector") {
    const outputs = (node.data as BasicEngineNode["data"]).nodeData?.outputs
    const output = outputs?.find(o => o.name === source.ref.port)
    return output?.values?.[0]?.type
  }
  return undefined
}
