// Pure helpers for the ImageDisplay node: classify an incoming u8 port value
// (raw pixels vs. encoded bytes), detect encoded formats by magic bytes, and
// convert raw gray / RGB / BGR / RGBA / BGRA frames to canvas RGBA.
//
// Port shapes always carry the batch dimension first; only the last batch
// entry is displayed.
//   [batch, H, W]        gray
//   [batch, H, W, 1]     gray
//   [batch, H, W, 3]     RGB or BGR (colorOrder)
//   [batch, H, W, 4]     RGBA or BGRA (colorOrder)
//   [batch, N] / [N]     encoded image bytes (JPEG, PNG, WebP)
//
// Hot-path friendly: planImageFrame() writes into a caller-owned plan object
// and convertToRgba() into a caller-owned buffer, so steady-state streaming
// allocates nothing. Port values are type-checked when ports connect, so only
// what is needed to pick a code path is inspected here.

// Saved decodeFormat values. "rgba" and "jpeg" are the names older graphs
// saved; they now mean "raw pixels" and "encoded bytes" respectively.
export type DecodeFormat = "auto" | "rgba" | "jpeg"
export type ColorOrder = "rgb" | "bgr"

export const DEFAULT_DECODE_FORMAT: DecodeFormat = "auto"
export const DEFAULT_COLOR_ORDER: ColorOrder = "rgb"

export function resolveDecodeFormat(value: unknown): DecodeFormat {
  return value === "rgba" || value === "jpeg" || value === "auto"
    ? value
    : DEFAULT_DECODE_FORMAT
}

export function resolveColorOrder(value: unknown): ColorOrder {
  return value === "bgr" ? "bgr" : DEFAULT_COLOR_ORDER
}

export type EncodedImageFormat = "jpeg" | "png" | "webp"

const MIME_TYPES: Record<EncodedImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

export function encodedImageMimeType(format: EncodedImageFormat | undefined): string {
  // Unknown bytes in the explicit "encoded" mode are tried as JPEG, which is
  // what that mode always did.
  return MIME_TYPES[format ?? "jpeg"]
}

// Magic-byte sniffing of bytes[offset, offset + length):
// JPEG FF D8 FF; PNG 89 'PNG' 0D 0A 1A 0A; WebP 'RIFF' <size> 'WEBP'.
export function detectEncodedImageFormat(
  bytes: ArrayLike<number>,
  offset = 0,
  length = bytes.length - offset,
): EncodedImageFormat | undefined {
  const o = offset
  if (length >= 3 && bytes[o] === 0xff && bytes[o + 1] === 0xd8 && bytes[o + 2] === 0xff) {
    return "jpeg"
  }
  if (
    length >= 8 &&
    bytes[o] === 0x89 &&
    bytes[o + 1] === 0x50 &&
    bytes[o + 2] === 0x4e &&
    bytes[o + 3] === 0x47 &&
    bytes[o + 4] === 0x0d &&
    bytes[o + 5] === 0x0a &&
    bytes[o + 6] === 0x1a &&
    bytes[o + 7] === 0x0a
  ) {
    return "png"
  }
  if (
    length >= 12 &&
    bytes[o] === 0x52 && // R
    bytes[o + 1] === 0x49 && // I
    bytes[o + 2] === 0x46 && // F
    bytes[o + 3] === 0x46 && // F
    bytes[o + 8] === 0x57 && // W
    bytes[o + 9] === 0x45 && // E
    bytes[o + 10] === 0x42 && // B
    bytes[o + 11] === 0x50 // P
  ) {
    return "webp"
  }
  return undefined
}

export type RawChannels = 1 | 3 | 4

// Mutable result of planImageFrame(). Fields not relevant to `kind` keep
// whatever an earlier call left there.
export interface ImageFramePlan {
  kind: "raw" | "encoded" | "error"
  /** raw: frame geometry. */
  width: number
  height: number
  channels: RawChannels
  /** raw/encoded: byte range of the last batch entry in the value's array. */
  offset: number
  length: number
  /** encoded: sniffed format (undefined = unknown, tried as JPEG). */
  format: EncodedImageFormat | undefined
  /** error: human-readable reason. */
  message: string
}

export function createImageFramePlan(): ImageFramePlan {
  return {
    kind: "error",
    width: 0,
    height: 0,
    channels: 4,
    offset: 0,
    length: 0,
    format: undefined,
    message: "",
  }
}

const RAW_SHAPES_HINT = "[H, W], [H, W, 3] or [H, W, 4]"

function fail(out: ImageFramePlan, message: string): ImageFramePlan {
  out.kind = "error"
  out.message = message
  return out
}

/**
 * Decides how to display a u8 value of the given shape. `bytes` is the
 * value's flat array (used for magic-byte sniffing of encoded data). Writes
 * into `out` (pass a reused object in hot paths) and returns it.
 */
export function planImageFrame(
  shape: readonly number[],
  bytes: ArrayLike<number>,
  decodeFormat: DecodeFormat,
  out: ImageFramePlan = createImageFramePlan(),
): ImageFramePlan {
  const ndim = shape.length

  // Raw pixel frames: [batch, H, W] or [batch, H, W, C].
  if (ndim === 3 || ndim === 4) {
    if (decodeFormat === "jpeg") {
      return fail(out, "Encoded format expects 1-D image bytes, got a pixel frame")
    }
    const channels = ndim === 4 ? shape[3] : 1
    if (channels !== 1 && channels !== 3 && channels !== 4) {
      return fail(out, `Unsupported channel count ${channels} (expected ${RAW_SHAPES_HINT})`)
    }
    const batch = shape[0]
    const height = shape[1]
    const width = shape[2]
    if (batch === 0 || height === 0 || width === 0) {
      return fail(out, "Empty image frame")
    }
    const length = height * width * channels
    out.kind = "raw"
    out.width = width
    out.height = height
    out.channels = channels
    out.length = length
    out.offset = (batch - 1) * length
    return out
  }

  // Encoded bytes: [batch, N] (one image per batch row) or [N].
  if (ndim === 1 || ndim === 2) {
    if (decodeFormat === "rgba") {
      return fail(out, `Raw format expects ${RAW_SHAPES_HINT} frames`)
    }
    const length = ndim === 2 ? shape[1] : bytes.length
    const offset = ndim === 2 ? (shape[0] - 1) * length : 0
    if (length === 0 || (ndim === 2 && shape[0] === 0)) {
      return fail(out, "Empty image bytes")
    }
    const format = detectEncodedImageFormat(bytes, offset, length)
    if (!format && decodeFormat === "auto") {
      return fail(out, "Unrecognized image bytes (expected JPEG, PNG or WebP)")
    }
    out.kind = "encoded"
    out.format = format
    out.offset = offset
    out.length = length
    return out
  }

  return fail(
    out,
    `Unsupported image shape [${shape.join(", ")}] (expected ${RAW_SHAPES_HINT} or encoded bytes)`,
  )
}

export const IS_LITTLE_ENDIAN =
  new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04

/**
 * Writes `pixelCount` gray / RGB / BGR / RGBA / BGRA pixels starting at
 * src[srcOffset] into `dst` as canvas RGBA, in a single pass with no
 * allocation. `colorOrder` only affects 3/4-channel input ("bgr" swaps R
 * and B; alpha of 4-channel input is kept, other inputs get 255).
 *
 * `dst32` is an optional Uint32Array view over `dst` (same buffer/offset)
 * that enables one 32-bit store per pixel — 1.5-2.5x faster than byte
 * stores. It is ignored on big-endian hosts; pass null to force the byte
 * path. Without it a temporary view is created (one small allocation).
 */
export function convertToRgba(
  src: Uint8Array | Uint8ClampedArray,
  srcOffset: number,
  pixelCount: number,
  channels: RawChannels,
  colorOrder: ColorOrder,
  dst: Uint8ClampedArray,
  dst32?: Uint32Array | null,
): void {
  if (channels === 4 && colorOrder === "rgb") {
    dst.set(src.subarray(srcOffset, srcOffset + pixelCount * 4))
    return
  }

  const words =
    dst32 === null || !IS_LITTLE_ENDIAN
      ? null
      : (dst32 ?? new Uint32Array(dst.buffer, dst.byteOffset, dst.length >> 2))

  if (words) {
    // Little-endian: 0xAABBGGRR is stored as R, G, B, A.
    if (channels === 1) {
      for (let i = 0, s = srcOffset; i < pixelCount; i++, s++) {
        words[i] = 0xff000000 | (src[s] * 0x010101)
      }
    } else if (channels === 3) {
      const r = colorOrder === "bgr" ? 2 : 0
      const b = 2 - r
      for (let i = 0, s = srcOffset; i < pixelCount; i++, s += 3) {
        words[i] = 0xff000000 | (src[s + b] << 16) | (src[s + 1] << 8) | src[s + r]
      }
    } else {
      // BGRA -> RGBA: swap bytes 0 and 2, keep G and A.
      for (let i = 0, s = srcOffset; i < pixelCount; i++, s += 4) {
        words[i] =
          ((src[s + 3] << 24) | (src[s] << 16) | (src[s + 1] << 8) | src[s + 2]) >>> 0
      }
    }
    return
  }

  if (channels === 1) {
    for (let i = 0, s = srcOffset, j = 0; i < pixelCount; i++, s++, j += 4) {
      const v = src[s]
      dst[j] = v
      dst[j + 1] = v
      dst[j + 2] = v
      dst[j + 3] = 255
    }
  } else if (channels === 3) {
    const r = colorOrder === "bgr" ? 2 : 0
    const b = 2 - r
    for (let i = 0, s = srcOffset, j = 0; i < pixelCount; i++, s += 3, j += 4) {
      dst[j] = src[s + r]
      dst[j + 1] = src[s + 1]
      dst[j + 2] = src[s + b]
      dst[j + 3] = 255
    }
  } else {
    for (let i = 0, s = srcOffset, j = 0; i < pixelCount; i++, s += 4, j += 4) {
      dst[j] = src[s + 2]
      dst[j + 1] = src[s + 1]
      dst[j + 2] = src[s]
      dst[j + 3] = src[s + 3]
    }
  }
}
