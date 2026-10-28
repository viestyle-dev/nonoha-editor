import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getEditorEdgeId,
  makeEditorModelUpdater,
} from "../editor-model-updater"

describe("getEditorEdgeId", () => {
  it("formats source:handle-target:handle", () => {
    expect(getEditorEdgeId("NodeA", "out", "NodeB", "in")).toBe(
      "NodeA:out-NodeB:in",
    )
  })

  it("omits handle separator when handle is null", () => {
    expect(getEditorEdgeId("NodeA", null, "NodeB", null)).toBe("NodeA-NodeB")
  })

  it("handles mixed null/non-null handles", () => {
    expect(getEditorEdgeId("NodeA", "out", "NodeB", null)).toBe(
      "NodeA:out-NodeB",
    )
    expect(getEditorEdgeId("NodeA", null, "NodeB", "in")).toBe(
      "NodeA-NodeB:in",
    )
  })

  it("handles $input/$output prefixes", () => {
    expect(getEditorEdgeId("$input:portA", null, "NodeB", "in")).toBe(
      "$input:portA-NodeB:in",
    )
  })

  it("handles $editor prefixed nodes", () => {
    expect(
      getEditorEdgeId("$editor:TriggerNode_abc", "trigger", "$input:test", null),
    ).toBe("$editor:TriggerNode_abc:trigger-$input:test")
  })

  it("does not contain dots (safe for JSON query paths)", () => {
    const id = getEditorEdgeId("NodeA", "out.0", "NodeB", "in.1")
    expect(id).toBe("NodeA:out:0-NodeB:in:1")
    expect(id).not.toContain(".")
  })
})

describe("makeEditorModelUpdater().addEditorEdge", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it("defaults waypoints to [] when caller omits the argument", async () => {
    const updater = makeEditorModelUpdater("host:1", "g1")
    updater.addEditorEdge("NodeA:out-NodeB:in", "NodeA", "out", "NodeB", "in")
    // promiseChain runs async; wait for it to drain
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("editor_edges.NodeA:out-NodeB:in")
    expect(init.method).toBe("PUT")
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      source: "NodeA",
      sourceHandle: "out",
      target: "NodeB",
      targetHandle: "in",
      waypoints: [],
    })
  })

  it("persists waypoints array when provided", async () => {
    const updater = makeEditorModelUpdater("host:1", "g1")
    updater.addEditorEdge(
      "NodeA:out-NodeB:in",
      "NodeA",
      "out",
      "NodeB",
      "in",
      ["$wp:a", "$wp:b"],
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.waypoints).toEqual(["$wp:a", "$wp:b"])
  })
})
