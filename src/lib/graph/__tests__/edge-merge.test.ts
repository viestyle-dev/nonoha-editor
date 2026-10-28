import { describe, it, expect } from "vitest"
import { Edge } from "@xyflow/react"
import { mergeEngineEdges } from "../edge-merge"
import type { BasicEdge } from "@/src/types/edge-types"

/** Helper to create a minimal engine edge. */
function makeEngineEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null = null,
  targetHandle: string | null = null,
  extra: Record<string, unknown> = {},
): BasicEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    data: {
      source: { type: "node" },
      target: { type: "node" },
      ...extra,
    },
  } as BasicEdge
}

/** Helper to create an editor edge (source or target is "editor" type). */
function makeEditorEdge(
  id: string,
  source: string,
  target: string,
): Edge {
  return {
    id,
    source,
    target,
    data: {
      source: { type: "editor" },
      target: { type: "node" },
    },
  }
}

describe("mergeEngineEdges", () => {
  it("returns fresh engine edges when no current edges exist", () => {
    const fresh = [makeEngineEdge("e1", "A", "B")]
    const result = mergeEngineEdges([], fresh)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("e1")
  })

  it("preserves waypointIds from matching current edge", () => {
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B", "out", "in", {
        waypointIds: ["$wp:abc", "$wp:def"],
      }),
    ]
    const fresh = [makeEngineEdge("e1", "A", "B", "out", "in")]
    const result = mergeEngineEdges(current, fresh)

    expect(result).toHaveLength(1)
    expect((result[0].data as Record<string, unknown>).waypointIds).toEqual([
      "$wp:abc",
      "$wp:def",
    ])
  })

  it("preserves editorModelUrl from matching current edge", () => {
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B", null, null, {
        editorModelUrl: "http://localhost:8000/model",
      }),
    ]
    const fresh = [makeEngineEdge("e1", "A", "B")]
    const result = mergeEngineEdges(current, fresh)

    expect((result[0].data as Record<string, unknown>).editorModelUrl).toBe(
      "http://localhost:8000/model",
    )
  })

  it("preserves both waypointIds and editorModelUrl", () => {
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B", "out", "in", {
        waypointIds: ["$wp:1"],
        editorModelUrl: "http://test/model",
      }),
    ]
    const fresh = [makeEngineEdge("e1", "A", "B", "out", "in")]
    const result = mergeEngineEdges(current, fresh)

    const data = result[0].data as Record<string, unknown>
    expect(data.waypointIds).toEqual(["$wp:1"])
    expect(data.editorModelUrl).toBe("http://test/model")
  })

  it("does not inject waypointIds when current edge has none", () => {
    const current: Edge[] = [makeEngineEdge("e1", "A", "B")]
    const fresh = [makeEngineEdge("e1", "A", "B")]
    const result = mergeEngineEdges(current, fresh)

    expect((result[0].data as Record<string, unknown>).waypointIds).toBeUndefined()
  })

  it("removes stale engine edges not in fresh set", () => {
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B"),
      makeEngineEdge("e2", "C", "D"),
    ]
    // Only e1 remains in fresh
    const fresh = [makeEngineEdge("e1", "A", "B")]
    const result = mergeEngineEdges(current, fresh)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("e1")
  })

  it("adds new engine edges from fresh set", () => {
    const current: Edge[] = [makeEngineEdge("e1", "A", "B")]
    const fresh = [
      makeEngineEdge("e1", "A", "B"),
      makeEngineEdge("e2", "C", "D"),
    ]
    const result = mergeEngineEdges(current, fresh)

    expect(result).toHaveLength(2)
    expect(result.map(e => e.id)).toContain("e2")
  })

  it("keeps editor edges that are not in fresh engine edges", () => {
    const editorEdge = makeEditorEdge("editor-1", "$editor:x", "A")
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B"),
      editorEdge,
    ]
    const fresh = [makeEngineEdge("e1", "A", "B")]
    const result = mergeEngineEdges(current, fresh)

    expect(result).toHaveLength(2)
    expect(result.find(e => e.id === "editor-1")).toBeDefined()
  })

  it("matches edges by connection endpoints, not by id", () => {
    // Edge id changed but connection is the same
    const current: Edge[] = [
      makeEngineEdge("old-id", "A", "B", "out", "in", {
        waypointIds: ["$wp:kept"],
      }),
    ]
    const fresh = [makeEngineEdge("new-id", "A", "B", "out", "in")]
    const result = mergeEngineEdges(current, fresh)

    // Should use fresh edge's id but preserve waypointIds
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("new-id")
    expect((result[0].data as Record<string, unknown>).waypointIds).toEqual(["$wp:kept"])
  })

  it("uses fresh edge data for non-preserved fields", () => {
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B", "out", "in", {
        valid: false,
        waypointIds: ["$wp:1"],
      }),
    ]
    const fresh = [makeEngineEdge("e1", "A", "B", "out", "in", { valid: true })]
    const result = mergeEngineEdges(current, fresh)

    const data = result[0].data as Record<string, unknown>
    expect(data.valid).toBe(true) // fresh value
    expect(data.waypointIds).toEqual(["$wp:1"]) // preserved
  })

  it("handles empty fresh edges — keeps only editor edges", () => {
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B"),
      makeEditorEdge("ed1", "$editor:x", "A"),
    ]
    const result = mergeEngineEdges(current, [])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ed1")
  })

  it("handles multiple edges with different waypointIds", () => {
    const current: Edge[] = [
      makeEngineEdge("e1", "A", "B", "out1", "in1", { waypointIds: ["$wp:a"] }),
      makeEngineEdge("e2", "A", "C", "out2", "in1", { waypointIds: ["$wp:b", "$wp:c"] }),
    ]
    const fresh = [
      makeEngineEdge("e1", "A", "B", "out1", "in1"),
      makeEngineEdge("e2", "A", "C", "out2", "in1"),
    ]
    const result = mergeEngineEdges(current, fresh)

    expect(result).toHaveLength(2)
    expect((result.find(e => e.id === "e1")!.data as Record<string, unknown>).waypointIds).toEqual(["$wp:a"])
    expect((result.find(e => e.id === "e2")!.data as Record<string, unknown>).waypointIds).toEqual(["$wp:b", "$wp:c"])
  })
})
