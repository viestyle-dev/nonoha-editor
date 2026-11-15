import { describe, expect, it } from "vitest"
import { checkEngineCompat, describeCompat, isCompatWarning } from "@/src/lib/engine-compat"

describe("checkEngineCompat", () => {
  it("accepts 1.x", () => {
    expect(checkEngineCompat("1.0.0", "ok")).toBe("ok")
    expect(checkEngineCompat("1.1.0", "ok")).toBe("ok")
    expect(checkEngineCompat("1.9.12.dev3", "ok")).toBe("ok")
  })

  it("flags versions outside the range", () => {
    expect(checkEngineCompat("0.11.0", "ok")).toBe("too_old")
    expect(checkEngineCompat("2.0.0", "ok")).toBe("too_new")
    expect(isCompatWarning("too_new")).toBe(true)
    expect(isCompatWarning("legacy")).toBe(false)
  })

  it("treats a missing capabilities endpoint as engine 1.0", () => {
    expect(checkEngineCompat(undefined, "none")).toBe("legacy")
    expect(checkEngineCompat(undefined, "loading")).toBe("loading")
    expect(checkEngineCompat(undefined, "error")).toBe("unreachable")
  })

  it("describes each state", () => {
    expect(describeCompat("too_new", "2.1.0")).toContain("2.1.0")
    expect(describeCompat("legacy", undefined)).toContain("1.1")
  })
})
