import { describe, it, expect } from "vitest"
import {
  filterWaypointsInSelection,
  mapClipboardWaypoints,
  stripPasteSuffix,
} from "../clipboard-handlers"

// ---------------------------------------------------------------------------
// stripPasteSuffix (existing function — regression)
// ---------------------------------------------------------------------------

describe("stripPasteSuffix", () => {
  it("removes a typical generated suffix", () => {
    expect(stripPasteSuffix("port_mpp5oz2p7byc12")).toBe("port")
  })

  it("returns name unchanged when no suffix", () => {
    expect(stripPasteSuffix("plain")).toBe("plain")
  })

  it("only strips one suffix layer (does not over-match short tails)", () => {
    expect(stripPasteSuffix("a_short")).toBe("a_short")
  })
})

// ---------------------------------------------------------------------------
// filterWaypointsInSelection
// ---------------------------------------------------------------------------

describe("filterWaypointsInSelection", () => {
  it("keeps waypoints present in the selection", () => {
    const selected = new Set(["$wp:a", "$wp:b", "NodeX"])
    expect(filterWaypointsInSelection(["$wp:a", "$wp:b"], selected)).toEqual([
      "$wp:a",
      "$wp:b",
    ])
  })

  it("drops waypoints absent from selection", () => {
    const selected = new Set(["$wp:a", "NodeX"])
    expect(
      filterWaypointsInSelection(["$wp:a", "$wp:outside"], selected),
    ).toEqual(["$wp:a"])
  })

  it("returns empty array when none in selection", () => {
    const selected = new Set(["NodeX"])
    expect(filterWaypointsInSelection(["$wp:a", "$wp:b"], selected)).toEqual([])
  })

  it("returns empty array for undefined input", () => {
    expect(filterWaypointsInSelection(undefined, new Set())).toEqual([])
  })

  it("returns empty array for empty input", () => {
    expect(filterWaypointsInSelection([], new Set(["$wp:a"]))).toEqual([])
  })

  it("preserves order of input ids", () => {
    const selected = new Set(["$wp:c", "$wp:a", "$wp:b"])
    expect(
      filterWaypointsInSelection(["$wp:c", "$wp:a", "$wp:b"], selected),
    ).toEqual(["$wp:c", "$wp:a", "$wp:b"])
  })
})

// ---------------------------------------------------------------------------
// mapClipboardWaypoints
// ---------------------------------------------------------------------------

describe("mapClipboardWaypoints", () => {
  it("remaps old waypoint IDs to new ones using nameMapping", () => {
    const mapping = new Map([
      ["$wp:old1", "$wp:new1"],
      ["$wp:old2", "$wp:new2"],
    ])
    expect(mapClipboardWaypoints(["$wp:old1", "$wp:old2"], mapping)).toEqual([
      "$wp:new1",
      "$wp:new2",
    ])
  })

  it("drops IDs not present in mapping", () => {
    const mapping = new Map([["$wp:old1", "$wp:new1"]])
    expect(
      mapClipboardWaypoints(["$wp:old1", "$wp:missing"], mapping),
    ).toEqual(["$wp:new1"])
  })

  it("returns empty array for undefined input", () => {
    expect(mapClipboardWaypoints(undefined, new Map())).toEqual([])
  })

  it("returns empty array for empty input", () => {
    expect(mapClipboardWaypoints([], new Map([["$wp:a", "$wp:b"]]))).toEqual(
      [],
    )
  })

  it("returns empty array when mapping has no matching keys", () => {
    expect(
      mapClipboardWaypoints(["$wp:x"], new Map([["$wp:y", "$wp:z"]])),
    ).toEqual([])
  })

  it("preserves order of input ids", () => {
    const mapping = new Map([
      ["$wp:a", "$wp:A"],
      ["$wp:b", "$wp:B"],
      ["$wp:c", "$wp:C"],
    ])
    expect(
      mapClipboardWaypoints(["$wp:c", "$wp:a", "$wp:b"], mapping),
    ).toEqual(["$wp:C", "$wp:A", "$wp:B"])
  })
})
