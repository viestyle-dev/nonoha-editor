import { describe, expect, it } from "vitest"

import {
  convertToRgba,
  createImageFramePlan,
  detectEncodedImageFormat,
  encodedImageMimeType,
  planImageFrame,
  resolveColorOrder,
  resolveDecodeFormat,
} from "@/src/lib/image-frame"

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56]

describe("resolveDecodeFormat / resolveColorOrder", () => {
  it("keeps the legacy saved values and defaults the rest", () => {
    expect(resolveDecodeFormat("rgba")).toBe("rgba")
    expect(resolveDecodeFormat("jpeg")).toBe("jpeg")
    expect(resolveDecodeFormat("auto")).toBe("auto")
    expect(resolveDecodeFormat(undefined)).toBe("auto")
    expect(resolveDecodeFormat("png")).toBe("auto")
    expect(resolveColorOrder("bgr")).toBe("bgr")
    expect(resolveColorOrder(undefined)).toBe("rgb")
    expect(resolveColorOrder("BGR")).toBe("rgb")
  })
})

describe("detectEncodedImageFormat", () => {
  it("recognizes JPEG, PNG and WebP magic bytes", () => {
    expect(detectEncodedImageFormat(JPEG)).toBe("jpeg")
    expect(detectEncodedImageFormat(PNG)).toBe("png")
    expect(detectEncodedImageFormat(WEBP)).toBe("webp")
  })

  it("honours offset and length", () => {
    const bytes = new Uint8Array([9, 9, ...PNG])
    expect(detectEncodedImageFormat(bytes)).toBeUndefined()
    expect(detectEncodedImageFormat(bytes, 2)).toBe("png")
    // Truncated range cannot hold the 8-byte PNG signature.
    expect(detectEncodedImageFormat(bytes, 2, 7)).toBeUndefined()
  })

  it("rejects RIFF containers that are not WebP and short inputs", () => {
    const wav = [...WEBP]
    wav[8] = 0x57 // W
    wav[9] = 0x41 // A
    wav[10] = 0x56 // V
    wav[11] = 0x45 // E
    expect(detectEncodedImageFormat(wav)).toBeUndefined()
    expect(detectEncodedImageFormat([0xff, 0xd8])).toBeUndefined()
    expect(detectEncodedImageFormat([])).toBeUndefined()
  })

  it("maps formats to MIME types, unknown -> JPEG", () => {
    expect(encodedImageMimeType("png")).toBe("image/png")
    expect(encodedImageMimeType("webp")).toBe("image/webp")
    expect(encodedImageMimeType(undefined)).toBe("image/jpeg")
  })
})

describe("planImageFrame", () => {
  const raw = (shape: number[]) =>
    planImageFrame(shape, new Uint8Array(shape.reduce((a, b) => a * b, 1)), "auto")

  it("classifies gray, RGB and RGBA frames and picks the last batch entry", () => {
    expect(raw([1, 2, 3])).toMatchObject({
      kind: "raw",
      height: 2,
      width: 3,
      channels: 1,
      offset: 0,
      length: 6,
    })
    expect(raw([2, 2, 3, 1])).toMatchObject({ kind: "raw", channels: 1, offset: 6 })
    expect(raw([3, 4, 5, 3])).toMatchObject({
      kind: "raw",
      channels: 3,
      length: 60,
      offset: 120,
    })
    expect(raw([1, 4, 5, 4])).toMatchObject({ kind: "raw", channels: 4, length: 80 })
  })

  it("rejects unsupported channel counts and empty frames", () => {
    expect(raw([1, 2, 2, 2]).kind).toBe("error")
    expect(raw([0, 2, 2, 3]).kind).toBe("error")
  })

  it("classifies [batch, N] and [N] bytes as encoded, sniffing the last row", () => {
    const two = new Uint8Array([...JPEG, ...PNG.slice(0, 6)]) // [2, 6]
    expect(planImageFrame([2, 6], two, "auto")).toMatchObject({
      kind: "error", // last row is a truncated PNG -> unknown in auto mode
    })
    const rows = new Uint8Array([...PNG.slice(0, 6), ...JPEG])
    expect(planImageFrame([2, 6], rows, "auto")).toMatchObject({
      kind: "encoded",
      format: "jpeg",
      offset: 6,
      length: 6,
    })
    expect(planImageFrame([WEBP.length], new Uint8Array(WEBP), "auto")).toMatchObject({
      kind: "encoded",
      format: "webp",
      offset: 0,
      length: WEBP.length,
    })
  })

  it("auto rejects unknown bytes; legacy jpeg mode still tries them", () => {
    const junk = new Uint8Array([1, 2, 3, 4])
    expect(planImageFrame([1, 4], junk, "auto").kind).toBe("error")
    expect(planImageFrame([1, 4], junk, "jpeg")).toMatchObject({
      kind: "encoded",
      format: undefined,
    })
  })

  it("forced modes reject the other family", () => {
    expect(planImageFrame([1, 2, 2, 3], new Uint8Array(12), "jpeg").kind).toBe("error")
    expect(planImageFrame([1, JPEG.length], new Uint8Array(JPEG), "rgba").kind).toBe("error")
    // Legacy "rgba" (raw) mode now also accepts RGB and gray.
    expect(planImageFrame([1, 2, 2, 3], new Uint8Array(12), "rgba").kind).toBe("raw")
    expect(planImageFrame([1, 2, 2], new Uint8Array(4), "rgba").kind).toBe("raw")
  })

  it("rejects other ranks", () => {
    expect(planImageFrame([], new Uint8Array(0), "auto").kind).toBe("error")
    expect(planImageFrame([1, 2, 2, 2, 3], new Uint8Array(24), "auto").kind).toBe("error")
  })

  it("writes into and returns a caller-owned plan object", () => {
    const out = createImageFramePlan()
    const result = planImageFrame([1, 2, 2, 3], new Uint8Array(12), "auto", out)
    expect(result).toBe(out)
    expect(out.kind).toBe("raw")
    planImageFrame([1, JPEG.length], new Uint8Array(JPEG), "auto", out)
    expect(out.kind).toBe("encoded")
  })
})

describe("convertToRgba", () => {
  // 2 pixels: (10, 20, 30) and (40, 50, 60).
  const rgb = new Uint8Array([10, 20, 30, 40, 50, 60])

  // Runs a conversion through both the 32-bit and the byte path and asserts
  // they agree.
  function both(
    src: Uint8Array,
    offset: number,
    pixels: number,
    channels: 1 | 3 | 4,
    order: "rgb" | "bgr",
  ): number[] {
    const a = new Uint8ClampedArray(pixels * 4)
    convertToRgba(src, offset, pixels, channels, order, a, new Uint32Array(a.buffer))
    const b = new Uint8ClampedArray(pixels * 4)
    convertToRgba(src, offset, pixels, channels, order, b, null)
    expect(Array.from(a)).toEqual(Array.from(b))
    return Array.from(a)
  }

  it("expands RGB to opaque RGBA", () => {
    expect(both(rgb, 0, 2, 3, "rgb")).toEqual([10, 20, 30, 255, 40, 50, 60, 255])
  })

  it("swaps R and B for BGR input", () => {
    expect(both(rgb, 0, 2, 3, "bgr")).toEqual([30, 20, 10, 255, 60, 50, 40, 255])
  })

  it("replicates gray into R, G and B", () => {
    expect(both(new Uint8Array([0, 128, 255]), 0, 3, 1, "rgb")).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ])
    // colorOrder does not affect gray.
    expect(both(new Uint8Array([7]), 0, 1, 1, "bgr")).toEqual([7, 7, 7, 255])
  })

  it("copies RGBA and converts BGRA, keeping alpha", () => {
    const px = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(both(px, 0, 2, 4, "rgb")).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(both(px, 0, 2, 4, "bgr")).toEqual([3, 2, 1, 4, 7, 6, 5, 8])
  })

  it("reads from srcOffset (last batch entry) and handles unaligned sources", () => {
    const batch = new Uint8Array([0, 0, 0].concat(Array.from(rgb))) // frame starts at 3
    expect(both(batch, 3, 2, 3, "rgb")).toEqual([10, 20, 30, 255, 40, 50, 60, 255])
    const unaligned = new Uint8Array(new ArrayBuffer(9), 1, 8)
    unaligned.set([1, 2, 3, 4, 5, 6, 7, 8])
    expect(both(unaligned, 0, 2, 4, "bgr")).toEqual([3, 2, 1, 4, 7, 6, 5, 8])
  })

  it("works without a provided 32-bit view", () => {
    const dst = new Uint8ClampedArray(8)
    convertToRgba(rgb, 0, 2, 3, "bgr", dst)
    expect(Array.from(dst)).toEqual([30, 20, 10, 255, 60, 50, 40, 255])
  })
})
