"use client"

import { useHandleConnections } from "@xyflow/react"
import { useEffect, useMemo, useRef } from "react"
import { SampleFlag } from "nonoha-client-js"
import type { GraphEndpoint, InspectorPortRef, PortValue, WatchOptions } from "nonoha-client-js"
import type { ValuesInfo } from "nonoha-views"

import { getNodeType } from "@/src/api/graph-api"
import { useInspector, useInspectorState } from "@/src/inspector/inspector-store"

export type EditorInputSource =
  | { kind: "none" }
  /** Solid edge from a $output port node: every value, as the app sees it. */
  | { kind: "output"; portName: string }
  /** Dashed edge from an engine node output: values sampled by the inspector. */
  | { kind: "inspector"; ref: InspectorPortRef; available: boolean }

const NONE: EditorInputSource = { kind: "none" }

export interface EditorInputOptions {
  /**
   * For a solid edge, also the value the output port holds now (outputs
   * send only new values): `true` delivers it to `onValues`, a function
   * receives it instead (e.g. to prime state without acting on it).
   * Dashed edges are sampled and need none.
   */
  current?: boolean | ((values: PortValue[]) => void)
  /** Subscribe only while true (e.g. once the receiver exists, so the current value is not lost). Default true. */
  enabled?: boolean
}

/**
 * Values arriving at one input handle of an editor (display) node, whichever
 * way it is connected. `onValues` may change between renders without
 * resubscribing. Values (and their typed arrays) are reused by the clients:
 * copy what you keep beyond the call.
 */
export function useEditorInput(
  graphEndpoint: GraphEndpoint | undefined,
  handleId: string,
  /** `info`: how a dashed edge's sampled values were reduced (none for a solid edge: values are whole). */
  onValues: (values: PortValue[], info?: ValuesInfo) => void,
  inspectorOptions: WatchOptions = DEFAULT_WATCH,
  options: EditorInputOptions = {},
): EditorInputSource {
  const connections = useHandleConnections({ type: "target", id: handleId })
  const connection = connections[0]
  const sourceId = connection?.source
  const sourceHandle = connection?.sourceHandle ?? null
  const inspector = useInspector()
  const { status, enabled, supported } = useInspectorState()

  const onValuesRef = useRef(onValues)
  onValuesRef.current = onValues
  const optionsRef = useRef(inspectorOptions)
  optionsRef.current = inspectorOptions
  const currentRef = useRef(options.current)
  currentRef.current = options.current

  const source = useMemo<EditorInputSource>(() => {
    if (!sourceId) return NONE
    const type = getNodeType(sourceId)
    if (type === "output") return { kind: "output", portName: sourceId.slice("$output:".length) }
    if (type === "node" && sourceHandle) {
      return {
        kind: "inspector",
        ref: { node: sourceId, dir: "out", port: sourceHandle },
        available: Boolean(supported && enabled),
      }
    }
    return NONE
  }, [sourceId, sourceHandle, supported, enabled])

  const sourceKey =
    source.kind === "output" ? `o:${source.portName}` : source.kind === "inspector" ? `i:${source.ref.node}.${source.ref.port}` : ""
  const inspectorLive = source.kind === "inspector" && source.available && status.state !== "idle"
  const wanted = options.enabled ?? true

  useEffect(() => {
    if (!wanted) return
    if (source.kind === "output") {
      if (!graphEndpoint) return
      return graphEndpoint.subscribeOutput(source.portName, values => onValuesRef.current(values), {
        current: currentRef.current
          ? values => {
              const current = currentRef.current
              ;(typeof current === "function" ? current : onValuesRef.current)(values)
            }
          : false,
        onError: error => console.error(error),
      })
    }
    if (source.kind === "inspector" && inspector && inspectorLive) {
      // Reused for every sample: how the values were reduced (views map coordinates with it)
      const info: { steps: readonly (readonly number[])[]; gap: boolean } = { steps: [], gap: false }
      const handle = inspector.watch(source.ref, optionsRef.current, {
        onSample: sample => {
          info.steps = sample.steps
          info.gap = (sample.flags & SampleFlag.Gap) !== 0
          onValuesRef.current(sample.values, info)
        },
      })
      return () => handle?.unwatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceKey identifies `source`
  }, [sourceKey, graphEndpoint, inspector, inspectorLive, wanted])

  return source
}

const DEFAULT_WATCH: WatchOptions = { intervalMs: 100, batch: "since", maxBytes: 512 * 1024 }

/** Options for image-like inputs: the latest frame, strided when it does not fit. */
export const IMAGE_WATCH: WatchOptions = { intervalMs: 66, batch: "last", maxBytes: 1024 * 1024, autoStride: [0, 1] }
/** Options for array snapshots (spectra, feature vectors): the last item. */
export const SNAPSHOT_WATCH: WatchOptions = { intervalMs: 100, batch: "last", maxBytes: 256 * 1024, autoStride: [0] }
/** Options for readouts of the latest value (numbers, bytes, colors): the last item, never strided. */
export const READOUT_WATCH: WatchOptions = { intervalMs: 100, batch: "last" }
