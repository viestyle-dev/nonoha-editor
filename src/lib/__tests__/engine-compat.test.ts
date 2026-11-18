import { describe, expect, it } from "vitest"
import { describeCompat, engineCompatStatus, isCompatWarning } from "@/src/lib/engine-compat"

describe("engineCompatStatus", () => {
  it("accepts 1.x", () => {
    expect(engineCompatStatus("1.0.0", "ok")).toBe("ok")
    expect(engineCompatStatus("1.1.0", "ok")).toBe("ok")
    expect(engineCompatStatus("1.9.12.dev3", "ok")).toBe("ok")
  })

  it("flags versions outside the range", () => {
    expect(engineCompatStatus("0.11.0", "ok")).toBe("too_old")
    expect(engineCompatStatus("2.0.0", "ok")).toBe("too_new")
    expect(isCompatWarning("too_new")).toBe(true)
    expect(isCompatWarning("legacy")).toBe(false)
  })

  it("treats a missing capabilities endpoint as engine 1.0", () => {
    expect(engineCompatStatus(undefined, "none")).toBe("legacy")
    expect(engineCompatStatus(undefined, "loading")).toBe("loading")
    expect(engineCompatStatus(undefined, "error")).toBe("unreachable")
  })

  it("describes each state", () => {
    expect(describeCompat("too_new", "2.1.0")).toContain("2.1.0")
    expect(describeCompat("legacy", undefined)).toContain("1.1")
  })
})
