"use client"

import { useHandleConnections } from "@xyflow/react"
import { useEffect, useMemo, useRef } from "react"
import type { GraphEndpoint, InspectorPortRef, PortValue, WatchOptions } from "nonoha-client-js"

import { getNodeType } from "@/src/api/graph-api"
import { subscribeGraphOutput } from "@/src/api/graph-output-hub"
import { useInspector, useInspectorState } from "@/src/inspector/inspector-store"

export type EditorInputSource =
  | { kind: "none" }
  /** Solid edge from a $output port node: every value, as the app sees it. */
  | { kind: "output"; portName: string }
  /** Dashed edge from an engine node output: values sampled by the inspector. */
  | { kind: "inspector"; ref: InspectorPortRef; available: boolean }

const NONE: EditorInputSource = { kind: "none" }

/**
 * Values arriving at one input handle of an editor (display) node, whichever
 * way it is connected. `onValues` may change between renders without
 * resubscribing. Values (and their typed arrays) are reused by the clients:
 * copy what you keep beyond the call.
 */
export function useEditorInput(
  graphEndpoint: GraphEndpoint | undefined,
  handleId: string,
  onValues: (values: PortValue[]) => void,
  inspectorOptions: WatchOptions = DEFAULT_WATCH,
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

  useEffect(() => {
    if (source.kind === "output") {
      if (!graphEndpoint) return
      return subscribeGraphOutput(graphEndpoint, source.portName, values => onValuesRef.current(values))
    }
    if (source.kind === "inspector" && inspector && inspectorLive) {
      const handle = inspector.watch(source.ref, optionsRef.current, {
        onSample: sample => {
          if (sample.values) onValuesRef.current(sample.values)
        },
      })
      return () => handle?.unwatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceKey identifies `source`
  }, [sourceKey, graphEndpoint, inspector, inspectorLive])

  return source
}

const DEFAULT_WATCH: WatchOptions = { intervalMs: 100, batch: "since", maxBytes: 512 * 1024 }

/** Options for image-like inputs: latest frame only, strided to fit. */
export const IMAGE_WATCH: WatchOptions = { intervalMs: 66, batch: "last", maxBytes: 1024 * 1024, autoStride: [0, 1] }
/** Options for array snapshots (spectra, feature vectors): latest row. */
export const SNAPSHOT_WATCH: WatchOptions = { intervalMs: 100, batch: "last", maxBytes: 256 * 1024, autoStride: [0] }
/** Options for latest-value readouts (numbers, bytes, colors): latest row, never strided. */
export const LATEST_WATCH: WatchOptions = { intervalMs: 100, batch: "last" }
