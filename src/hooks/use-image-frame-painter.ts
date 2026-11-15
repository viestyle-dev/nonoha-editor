"use client"

import { RefObject, useCallback, useEffect, useRef } from "react"
import { PortDataType, PortValue } from "nonoha-client-js"

import { useRafPainter } from "@/src/hooks/use-raf-painter"
import {
  ColorOrder,
  convertToRgba,
  createImageFramePlan,
  DecodeFormat,
  EncodedImageFormat,
  encodedImageMimeType,
  planImageFrame,
  RawChannels,
} from "@/src/lib/image-frame"

export interface ImageFramePainterOptions {
  decodeFormat: DecodeFormat
  colorOrder: ColorOrder
  /** Fires only on error state transitions (undefined = cleared). */
  onError?: (error: string | undefined) => void
}

// Latest raw frame: a reference into the message's array plus geometry.
// One mutable record, overwritten per message (only the newest matters).
type RawFrame = {
  src: Uint8Array | null
  offset: number
  width: number
  height: number
  channels: RawChannels
  seq: number
}

// Reused RGBA destination + ImageData; reallocated only on size change.
type RgbaTarget = {
  width: number
  height: number
  data: Uint8ClampedArray
  words: Uint32Array
  image: ImageData
}

type EncodedJob = {
  bytes: Uint8Array
  format: EncodedImageFormat | undefined
  seq: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isChromium = typeof globalThis !== "undefined" && !!(globalThis as Record<string, any>).chrome

/**
 * Cross-browser image decode.
 * Chromium: createImageBitmap(blob) — off-thread decode.
 * Firefox/Safari: img.decode() + createImageBitmap(img) — off-thread decode.
 */
function decodeToBitmap(bytes: Uint8Array, mimeType: string): Promise<ImageBitmap> {
  const blob = new Blob([bytes as BlobPart], { type: mimeType })
  if (isChromium) {
    return createImageBitmap(blob)
  }
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  return img
    .decode()
    .then(() => createImageBitmap(img))
    .finally(() => URL.revokeObjectURL(url))
}

/**
 * Canvas painter for ImageDisplay. Returns a stable `accept(value)` to call
 * from the port data callback.
 *
 * Per message, accept() only records where the newest frame lives (raw
 * pixels: array reference + geometry, no copy, no allocation) or queues
 * encoded bytes for decode. The canvas is painted at most once per animation
 * frame: raw frames are converted straight into a reused RGBA buffer that
 * backs a reused ImageData (single pass, 32-bit stores), then
 * putImageData'd. Encoded frames decode off-thread one at a time; while a
 * decode is in flight only the newest pending frame is kept, so a fast
 * stream cannot pile up decodes.
 */
export function useImageFramePainter(
  canvasRef: RefObject<HTMLCanvasElement>,
  options: ImageFramePainterOptions,
): (value: PortValue | undefined) => void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const planRef = useRef(createImageFramePlan())
  const seqRef = useRef(0)
  const rawRef = useRef<RawFrame>({
    src: null,
    offset: 0,
    width: 0,
    height: 0,
    channels: 4,
    seq: 0,
  })
  const bitmapRef = useRef<{ bitmap: ImageBitmap; seq: number } | null>(null)
  const paintedSeqRef = useRef(0)
  const paintedOrderRef = useRef<ColorOrder | null>(null)
  const targetRef = useRef<RgbaTarget | null>(null)
  const ctxRef = useRef<{
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
  } | null>(null)

  const decodingRef = useRef(false)
  const pendingJobRef = useRef<EncodedJob | null>(null)
  // Bumped on unmount so late decodes close their bitmaps.
  const decodeGenRef = useRef(0)

  const errorRef = useRef<string | undefined>(undefined)
  const reportedErrorRef = useRef<string | undefined>(undefined)

  const painter = useRafPainter(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      // Not mounted yet; try again next frame.
      if (rawRef.current.src || bitmapRef.current) painter.schedule()
      return
    }
    let cached = ctxRef.current
    if (!cached || cached.canvas !== canvas) {
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      cached = ctxRef.current = { canvas, ctx }
    }
    const ctx = cached.ctx

    const raw = rawRef.current
    const decoded = bitmapRef.current
    const colorOrder = optionsRef.current.colorOrder

    if (decoded && decoded.seq > raw.seq) {
      const { bitmap } = decoded
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width
        canvas.height = bitmap.height
      }
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      bitmapRef.current = null
      paintedSeqRef.current = decoded.seq
    } else if (
      raw.src &&
      (raw.seq > paintedSeqRef.current ||
        (raw.seq === paintedSeqRef.current && colorOrder !== paintedOrderRef.current))
    ) {
      if (decoded) {
        // Superseded by a newer raw frame.
        decoded.bitmap.close()
        bitmapRef.current = null
      }
      const { width, height } = raw
      let target = targetRef.current
      if (!target || target.width !== width || target.height !== height) {
        const data = new Uint8ClampedArray(width * height * 4)
        target = targetRef.current = {
          width,
          height,
          data,
          words: new Uint32Array(data.buffer),
          image: new ImageData(data, width, height),
        }
      }
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      convertToRgba(
        raw.src,
        raw.offset,
        width * height,
        raw.channels,
        colorOrder,
        target.data,
        target.words,
      )
      ctx.putImageData(target.image, 0, 0)
      paintedSeqRef.current = raw.seq
      paintedOrderRef.current = colorOrder
    }

    if (errorRef.current !== reportedErrorRef.current) {
      reportedErrorRef.current = errorRef.current
      optionsRef.current.onError?.(errorRef.current)
    }
  })

  const setError = useCallback(
    (error: string | undefined) => {
      if (errorRef.current !== error) {
        errorRef.current = error
        painter.schedule()
      }
    },
    [painter],
  )

  const startDecode = useCallback(
    (job: EncodedJob) => {
      decodingRef.current = true
      const gen = decodeGenRef.current
      decodeToBitmap(job.bytes, encodedImageMimeType(job.format))
        .then(bitmap => {
          if (gen !== decodeGenRef.current) {
            bitmap.close()
            return
          }
          bitmapRef.current?.bitmap.close()
          bitmapRef.current = { bitmap, seq: job.seq }
          setError(undefined)
          painter.schedule()
        })
        .catch(() => {
          if (gen !== decodeGenRef.current) return
          const name = job.format ? job.format.toUpperCase() : "Image"
          setError(`${name} decode failed`)
        })
        .finally(() => {
          if (gen !== decodeGenRef.current) return
          decodingRef.current = false
          const next = pendingJobRef.current
          pendingJobRef.current = null
          if (next) startDecode(next)
        })
    },
    [painter, setError],
  )

  const accept = useCallback(
    (value: PortValue | undefined) => {
      // Port types are matched on connect; this only narrows the array type.
      if (!value || value.dataType !== PortDataType.Uint8) {
        setError("Unsupported data type (expected u8)")
        return
      }
      const bytes = value.array
      const plan = planImageFrame(
        value.shape,
        bytes,
        optionsRef.current.decodeFormat,
        planRef.current,
      )
      if (plan.kind === "error") {
        setError(plan.message)
        return
      }
      const seq = ++seqRef.current

      if (plan.kind === "raw") {
        const raw = rawRef.current
        raw.src = bytes
        raw.offset = plan.offset
        raw.width = plan.width
        raw.height = plan.height
        raw.channels = plan.channels
        raw.seq = seq
        if (errorRef.current !== undefined) setError(undefined)
        painter.schedule()
        return
      }

      const job: EncodedJob = {
        bytes: bytes.subarray(plan.offset, plan.offset + plan.length),
        format: plan.format,
        seq,
      }
      if (decodingRef.current) {
        pendingJobRef.current = job
      } else {
        startDecode(job)
      }
    },
    [painter, setError, startDecode],
  )

  // Repaint the last raw frame when the colour order setting changes.
  useEffect(() => {
    painter.schedule()
  }, [options.colorOrder, painter])

  useEffect(() => {
    return () => {
      // Invalidate in-flight decodes so completed bitmaps get closed.
      decodeGenRef.current++ // eslint-disable-line react-hooks/exhaustive-deps
      decodingRef.current = false
      pendingJobRef.current = null
      bitmapRef.current?.bitmap.close()
      bitmapRef.current = null
    }
  }, [])

  return accept
}
