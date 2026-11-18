import { PortDataType } from "nonoha-client-js"

/**
 * How a value can be shown, decided from its data type and shape only.
 *
 * Ports carry plain arrays without meaning (no "image" or "audio" type), so
 * hosts guess a presentation from the shape and let the user override it.
 * Shapes include the batch dimension first, as values arrive.
 */
export type ValueKind =
  /** u8 [B, H, W] (gray) or [B, H, W, 3 | 4] (RGB/BGR, RGBA). */
  | 'image'
  /** u8 [B, N]: encoded bytes (JPEG/PNG/WebP), or plain bytes. */
  | 'bytes'
  /** Numeric [B] or [B, 1]: one number per row. */
  | 'scalar'
  /** Numeric [B, N]: a vector per row (spectrum, features, samples). */
  | 'vector'
  /**
   * Numeric [B] or [B, C] (at most 8 channels) with several items per
   * dispatch: a stream such as an audio block, a line per channel.
   */
  | 'series'
  /** Numeric [B, H, W] (non-u8), or u8 [B, H, W] that is too small for an image: a grid. */
  | 'grid'
  /** Bool values. */
  | 'bool'
  /** String values. */
  | 'text'
  /** Anything else (higher rank, complex, ...). */
  | 'other'

/** Smallest gray u8 frame treated as an image rather than a grid of numbers. */
const MIN_IMAGE_SIDE = 16
/** Most channels a stream of items is drawn with (more: a vector per item). */
const MAX_SERIES_CHANNELS = 8

export function interpretValue(dataType: PortDataType, shape: readonly number[]): ValueKind {
  if (dataType === PortDataType.String) return 'text'
  if (dataType === PortDataType.Bool) return shape.length <= 2 ? 'bool' : 'grid'
  if (dataType === PortDataType.Complex64 || dataType === PortDataType.Complex128) return 'other'
  const rank = shape.length - 1 // without batch
  const isU8 = dataType === PortDataType.Uint8
  if (shape[0] > 1 && (rank <= 0 || (rank === 1 && shape[1] <= MAX_SERIES_CHANNELS))) return 'series'
  if (rank <= 0) return 'scalar'
  if (rank === 1) {
    if (shape[1] === 1) return 'scalar'
    return isU8 ? 'bytes' : 'vector'
  }
  if (rank === 2) {
    if (isU8 && shape[1] >= MIN_IMAGE_SIDE && shape[2] >= MIN_IMAGE_SIDE) return 'image'
    return 'grid'
  }
  if (rank === 3) {
    const channels = shape[3]
    if (isU8 && (channels === 1 || channels === 3 || channels === 4)) return 'image'
    return 'other'
  }
  return 'other'
}

/** Kinds a value of the given kind can also be shown as (first = default). */
export function alternativeKinds(kind: ValueKind): ValueKind[] {
  switch (kind) {
    case 'image':
      return ['image', 'grid']
    case 'grid':
      return ['grid', 'vector']
    case 'vector':
      return ['vector', 'grid']
    case 'bytes':
      return ['bytes', 'vector']
    case 'series':
      return ['series', 'scalar']
    default:
      return [kind]
  }
}
