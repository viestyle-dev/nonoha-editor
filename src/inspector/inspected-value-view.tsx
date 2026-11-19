"use client"

import { css } from "@emotion/react"
import { Typography } from "@mui/material"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import { InspectorPortRef, PortDataType, PortValue, WatchOptions } from "nonoha-client-js"
import { interpretValue, type ValueKind } from "./interpret"

import { useChartTheme } from "@/src/hooks/use-chart-theme"
import { useImageFramePainter } from "@/src/hooks/use-image-frame-painter"
import { useRafPainter } from "@/src/hooks/use-raf-painter"
import { useThemeStore } from "@/src/stores/theme-store"
import { buildColormapLut } from "@/src/lib/colormaps"
import type { ColorOrder } from "@/src/lib/image-frame"
import { useInspector, useInspectorState, usePortProblem } from "@/src/inspector/inspector-store"
import {
  createRendererState,
  drawGrid,
  drawScalar,
  drawSeries,
  drawVector,
  fitCanvas,
  formatNumber,
  pushScalar,
} from "@/src/inspector/value-renderers"

export interface DetectedValue {
  kind: ValueKind
  dataType: PortDataType
  /** Shape of the sampled value (with batch, after any reduction). */
  shape: number[]
}

// Every item of the latest dispatch: one for an image or a spectrum, a whole
// block for a stream (audio); the newest that fit when there are too many
const WATCH_OPTIONS: WatchOptions = { intervalMs: 100, batch: "all", maxBytes: 256 * 1024, autoStride: [0, 1] }
const DATA_TYPE_NAMES: Record<number, string> = {
  [PortDataType.Bool]: "bool",
  [PortDataType.Int8]: "i8",
  [PortDataType.Uint8]: "u8",
  [PortDataType.Int16]: "i16",
  [PortDataType.Uint16]: "u16",
  [PortDataType.Int32]: "i32",
  [PortDataType.Uint32]: "u32",
  [PortDataType.Int64]: "i64",
  [PortDataType.Uint64]: "u64",
  [PortDataType.Float32]: "f32",
  [PortDataType.Float64]: "f64",
  [PortDataType.String]: "str",
}

export function dataTypeName(dataType: PortDataType): string {
  return DATA_TYPE_NAMES[dataType] ?? "?"
}

function rowSize(shape: readonly number[]): number {
  let n = 1
  for (let i = 1; i < shape.length; ++i) n *= shape[i]
  return n
}

/**
 * Live view of one port, sampled through the inspector. The presentation
 * is guessed from the value's shape (see interpretValue) unless `kind` is
 * given. Draws at most once per animation frame.
 */
export const InspectedValueView = memo(function InspectedValueView({
  portRef,
  kind: forcedKind,
  colorOrder,
  paused = false,
  height = 200,
  onDetected,
}: {
  portRef: InspectorPortRef
  kind?: ValueKind
  colorOrder: ColorOrder
  paused?: boolean
  height?: number
  onDetected?: (detected: DetectedValue) => void
}) {
  const inspector = useInspector()
  // Re-render on status changes (connected below), but re-watch only when the connection itself changes
  useInspectorState()
  const connected = Boolean(inspector?.connected)
  const problem = usePortProblem(portRef)
  const [{ colors }] = useThemeStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const theme = useChartTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme
  const lut = useMemo(() => buildColormapLut("viridis"), [])
  const rendererState = useRef(createRendererState())
  const latest = useRef<PortValue | null>(null)
  const detectedRef = useRef<DetectedValue | null>(null)
  const [detected, setDetected] = useState<DetectedValue | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const kind = forcedKind ?? detected?.kind
  const kindRef = useRef(kind)
  kindRef.current = kind
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  const acceptImage = useImageFramePainter(canvasRef, { decodeFormat: "auto", colorOrder, onError: setError })

  const painter = useRafPainter(() => {
    const value = latest.current
    const canvas = canvasRef.current
    if (!value || !canvas) return
    const fitted = fitCanvas(canvas)
    if (!fitted) return
    const { ctx, width, height } = fitted
    const shape = value.shape
    const array = value.array as ArrayLike<number>
    const n = rowSize(shape)
    const offset = Math.max(0, shape[0] - 1) * n // last batch row
    switch (kindRef.current) {
      case "vector":
      case "bytes":
        drawVector(ctx, width, height, array, offset, n, themeRef.current)
        break
      case "grid":
      case "image": {
        const rows = shape.length >= 3 ? shape[1] : 1
        const cols = shape.length >= 3 ? n / rows : n
        drawGrid(rendererState.current, ctx, width, height, array, offset, rows, cols, lut, themeRef.current)
        break
      }
      case "scalar":
        drawScalar(rendererState.current, ctx, width, height, Number(array[array.length - 1]), themeRef.current)
        break
      case "series":
        drawSeries(ctx, width, height, array, shape[0], shape.length > 1 ? shape[1] : 1, themeRef.current)
        break
    }
  }, canvasRef)

  useEffect(() => {
    if (!inspector || paused || !connected) return
    const handle = inspector.watch(portRef, WATCH_OPTIONS, {
      onSample: sample => {
        const value = sample.values[0]
        if (!value) return
        const previous = detectedRef.current
        if (
          !previous ||
          previous.dataType !== value.dataType ||
          previous.shape.length !== value.shape.length ||
          previous.shape.some((d, i) => i > 0 && d !== value.shape[i])
        ) {
          const next = {
            kind: interpretValue(value.dataType, value.shape),
            dataType: value.dataType,
            shape: value.shape.slice(),
          }
          detectedRef.current = next
          setDetected(next)
          onDetectedRef.current?.(next)
        }
        const current = kindRef.current ?? detectedRef.current!.kind
        if (current === "text" || current === "bool") {
          const array = value.array as ArrayLike<unknown>
          setText(String(array[array.length - 1]))
          return
        }
        if (current === "scalar") {
          const array = value.array as ArrayLike<number>
          pushScalar(rendererState.current, Number(array[array.length - 1]))
        }
        if (current === "image" && value.dataType === PortDataType.Uint8 && forcedKind !== "grid") {
          acceptImage(value)
          return
        }
        if (current === "bytes" && !forcedKind) {
          acceptImage(value) // encoded JPEG/PNG; falls back to the plot on error
        }
        latest.current = value
        painter.schedule()
      },
    })
    return () => handle?.unwatch()
  }, [inspector, portRef, paused, painter, acceptImage, forcedKind, connected])

  // Encoded bytes that are not an image: show them as a plot instead.
  useEffect(() => {
    if (error && kind === "bytes") painter.schedule()
  }, [error, kind, painter])

  const showText = kind === "text" || kind === "bool"
  return (
    <div css={css({ position: "relative", width: "100%", height })}>
      <canvas
        ref={canvasRef}
        css={css({ width: "100%", height: "100%", display: showText ? "none" : "block", borderRadius: 4 })}
      />
      {showText && (
        <div
          css={css({
            height: "100%",
            overflow: "auto",
            padding: 8,
            fontFamily: "monospace",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            background: theme.plotBackground,
            borderRadius: 4,
          })}
        >
          {text ?? ""}
        </div>
      )}
      {!detected && !problem && (
        <Typography
          variant="caption"
          css={css({ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: theme.textMuted })}
        >
          {!connected ? "Inspector is off" : paused ? "Paused" : "Waiting for a value…"}
        </Typography>
      )}
      {problem && !paused && (
        <Typography
          variant="caption"
          role="status"
          css={css({
            position: "absolute",
            left: 4,
            right: 4,
            bottom: 4,
            padding: "2px 6px",
            borderRadius: 4,
            background: theme.plotBackground,
            color: colors.error,
            overflowWrap: "anywhere",
          })}
        >
          {problem}
        </Typography>
      )}
    </div>
  )
})

export function describeShape(detected: DetectedValue | null): string {
  if (!detected) return ""
  return `${dataTypeName(detected.dataType)}[${detected.shape.slice(1).join("×") || "1"}]`
}

export { formatNumber }
