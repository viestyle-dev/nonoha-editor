import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Edge, Node } from "@xyflow/react"

// Mock the graph-api network functions before importing the SUT. The real
// getNodeType is preserved (pure helper, no side imports).
vi.mock("@/src/api/graph-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/src/api/graph-api")>(
      "@/src/api/graph-api",
    )
  return {
    ...actual,
    graphRemoveEdge: vi.fn().mockResolvedValue(undefined),
    graphRemoveNode: vi.fn().mockResolvedValue(undefined),
    graphRemoveInput: vi.fn().mockResolvedValue(undefined),
    graphRemoveOutput: vi.fn().mockResolvedValue(undefined),
  }
})

import {
  cleanupOrphanWaypoints,
  cleanupWaypointsFromEdgesBatch,
  handleEdgesDelete,
  handleNodesDelete,
} from "../edge-handlers"
import {
  graphRemoveEdge,
  graphRemoveNode,
  graphRemoveInput,
  graphRemoveOutput,
} from "@/src/api/graph-api"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEngineEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null = "out",
  targetHandle: string | null = "in",
  extra: Record<string, unknown> = {},
): Edge {
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
  } as Edge
}

function makeEditorEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null = "trigger",
  targetHandle: string | null = null,
  extra: Record<string, unknown> = {},
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    data: {
      source: { type: "editor" },
      target: { type: "input" },
      ...extra,
    },
  } as Edge
}

function makeInputToNodeEdge(
  id: string,
  sourceInputName: string,
  targetNodeId: string,
  targetHandle = "in",
  extra: Record<string, unknown> = {},
): Edge {
  return {
    id,
    source: `$input:${sourceInputName}`,
    target: targetNodeId,
    sourceHandle: null,
    targetHandle,
    data: {
      source: { type: "input" },
      target: { type: "node" },
      ...extra,
    },
  } as Edge
}

function makeWaypointNode(id: string): Node {
  return { id, type: "WaypointNode", position: { x: 0, y: 0 }, data: {} } as Node
}

function makeEngineNode(id: string): Node {
  return { id, type: "BasicEngineNode", position: { x: 0, y: 0 }, data: {} } as Node
}

function makeEditorNodeObj(id: string): Node {
  return { id, type: "TriggerNode", position: { x: 0, y: 0 }, data: {} } as Node
}

function makeInputPortNode(name: string): Node {
  return {
    id: `$input:${name}`,
    type: "BasicPortNode",
    position: { x: 0, y: 0 },
    data: {},
  } as Node
}

function makeOutputPortNode(name: string): Node {
  return {
    id: `$output:${name}`,
    type: "BasicPortNode",
    position: { x: 0, y: 0 },
    data: {},
  } as Node
}

function makeMockEditorModelUpdater() {
  return {
    editorModelUrl: "http://test/editor-model",
    updateNodePosition: vi.fn(),
    updateNodeSize: vi.fn(),
    addEditorNode: vi.fn(),
    removeNode: vi.fn(),
    addEditorEdge: vi.fn(),
    removeEditorEdge: vi.fn(),
    getNodeData: vi.fn(),
    patchNodeData: vi.fn(),
  }
}

function makeMockNodeRegistry() {
  return {
    unregisterNode: vi.fn(),
  } as unknown as Parameters<typeof handleNodesDelete>[1]["nodeRegistry"]
}

const noopSnackbar = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Stub global fetch (cleanupWaypointsFromEdgesBatch PUTs via direct fetch).
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
})

// ---------------------------------------------------------------------------
// handleEdgesDelete
// ---------------------------------------------------------------------------

describe("handleEdgesDelete", () => {
  it("calls graphRemoveEdge + removeEditorEdge for engine edge", () => {
    const edge = makeEngineEdge("NodeA.out-NodeB.in", "NodeA", "NodeB")
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleEdgesDelete(
      [edge],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        edges: [edge],
        setNodes: vi.fn(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveEdge).toHaveBeenCalledTimes(1)
    expect(graphRemoveEdge).toHaveBeenCalledWith("host:1", "g1", "NodeA.out", "NodeB.in")
    expect(editorModelUpdater.removeEditorEdge).toHaveBeenCalledTimes(1)
    expect(editorModelUpdater.removeEditorEdge).toHaveBeenCalledWith("NodeA:out-NodeB:in")
  })

  it("calls only removeEditorEdge for editor edge (no graphRemoveEdge)", () => {
    const edge = makeEditorEdge(
      "$editor:Trigger_x:trigger-$input:advance",
      "$editor:Trigger_x",
      "$input:advance",
    )
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleEdgesDelete(
      [edge],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        edges: [edge],
        setNodes: vi.fn(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveEdge).not.toHaveBeenCalled()
    expect(editorModelUpdater.removeEditorEdge).toHaveBeenCalledTimes(1)
    expect(editorModelUpdater.removeEditorEdge).toHaveBeenCalledWith(
      "$editor:Trigger_x:trigger-$input:advance",
    )
  })

  it("translates $input/$output source/target to engine port form", () => {
    const edge = makeInputToNodeEdge(
      ".trigger-NodeA.in",
      "trigger",
      "NodeA",
      "in",
    )
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleEdgesDelete(
      [edge],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        edges: [edge],
        setNodes: vi.fn(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveEdge).toHaveBeenCalledWith("host:1", "g1", ".trigger", "NodeA.in")
  })

  it("is no-op for empty deletedEdges array", () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleEdgesDelete(
      [],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        edges: [],
        setNodes: vi.fn(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveEdge).not.toHaveBeenCalled()
    expect(editorModelUpdater.removeEditorEdge).not.toHaveBeenCalled()
  })

  it("removes orphan waypoint via cleanupOrphanWaypoints", () => {
    const edge = makeEngineEdge("NodeA.out-NodeB.in", "NodeA", "NodeB", "out", "in", {
      waypointIds: ["$wp:abc"],
    })
    const setNodes = vi.fn()
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleEdgesDelete(
      [edge],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        edges: [edge],
        setNodes,
        editorModelUpdater,
      },
      noopSnackbar,
    )
    // Orphan: $wp:abc is only referenced by the deleted edge.
    expect(setNodes).toHaveBeenCalledTimes(1)
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith("$wp:abc")
  })

  it("keeps waypoint shared with surviving edge", () => {
    const wpId = "$wp:shared"
    const deletedEdge = makeEngineEdge("A.out-B.in", "A", "B", "out", "in", {
      waypointIds: [wpId],
    })
    const survivingEdge = makeEngineEdge("C.out-D.in", "C", "D", "out", "in", {
      waypointIds: [wpId],
    })
    const setNodes = vi.fn()
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleEdgesDelete(
      [deletedEdge],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        edges: [deletedEdge, survivingEdge],
        setNodes,
        editorModelUpdater,
      },
      noopSnackbar,
    )
    // Shared waypoint should NOT be removed.
    expect(setNodes).not.toHaveBeenCalled()
    expect(editorModelUpdater.removeNode).not.toHaveBeenCalledWith(wpId)
  })

  it("calls removeEditorEdge for every deleted edge in mixed batch", () => {
    const e1 = makeEngineEdge("A.out-B.in", "A", "B")
    const e2 = makeEditorEdge(
      "$editor:T:t-$input:i",
      "$editor:T",
      "$input:i",
    )
    const e3 = makeEngineEdge("C.out-D.in", "C", "D")
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleEdgesDelete(
      [e1, e2, e3],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        edges: [e1, e2, e3],
        setNodes: vi.fn(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveEdge).toHaveBeenCalledTimes(2) // engine edges only
    expect(editorModelUpdater.removeEditorEdge).toHaveBeenCalledTimes(3) // all edges
  })
})

// ---------------------------------------------------------------------------
// handleNodesDelete
// ---------------------------------------------------------------------------

describe("handleNodesDelete", () => {
  it("calls graphRemoveNode then editorModelUpdater.removeNode for engine node", async () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleNodesDelete(
      [makeEngineNode("NodeA")],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        setEdges: vi.fn(),
        nodeRegistry: makeMockNodeRegistry(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveNode).toHaveBeenCalledWith("host:1", "g1", "NodeA")
    // removeNode is called inside .then() — wait a tick.
    await Promise.resolve()
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith("NodeA")
  })

  it("calls graphRemoveInput for input port node", async () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleNodesDelete(
      [makeInputPortNode("trigger")],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        setEdges: vi.fn(),
        nodeRegistry: makeMockNodeRegistry(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveInput).toHaveBeenCalledWith("host:1", "g1", "trigger")
    await Promise.resolve()
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith("$input:trigger")
  })

  it("calls graphRemoveOutput for output port node", async () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleNodesDelete(
      [makeOutputPortNode("venue")],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        setEdges: vi.fn(),
        nodeRegistry: makeMockNodeRegistry(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveOutput).toHaveBeenCalledWith("host:1", "g1", "venue")
    await Promise.resolve()
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith("$output:venue")
  })

  it("unregisters editor node and removes from model (no engine call)", () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    const nodeRegistry = makeMockNodeRegistry()
    const editorNode = makeEditorNodeObj("$editor:TriggerNode_x")
    handleNodesDelete(
      [editorNode],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        setEdges: vi.fn(),
        nodeRegistry,
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveNode).not.toHaveBeenCalled()
    expect(graphRemoveInput).not.toHaveBeenCalled()
    expect(graphRemoveOutput).not.toHaveBeenCalled()
    expect(
      (nodeRegistry as unknown as { unregisterNode: ReturnType<typeof vi.fn> })
        .unregisterNode,
    ).toHaveBeenCalledWith("$editor:TriggerNode_x")
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith("$editor:TriggerNode_x")
  })

  it("collects waypoint IDs and calls cleanupWaypointsFromEdgesBatch", () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    const setEdges = vi.fn((updater: (prev: Edge[]) => Edge[]) => updater([]))
    handleNodesDelete(
      [makeWaypointNode("$wp:1"), makeWaypointNode("$wp:2")],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        setEdges,
        nodeRegistry: makeMockNodeRegistry(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    // removeNode called for each waypoint
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith("$wp:1")
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith("$wp:2")
    // setEdges called by cleanupWaypointsFromEdgesBatch
    expect(setEdges).toHaveBeenCalledTimes(1)
  })

  it("does not call cleanupWaypointsFromEdgesBatch if no waypoints deleted", () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    const setEdges = vi.fn()
    handleNodesDelete(
      [makeEngineNode("NodeA")],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        setEdges,
        nodeRegistry: makeMockNodeRegistry(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(setEdges).not.toHaveBeenCalled()
  })

  it("is no-op for empty deletedNodes array", () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    handleNodesDelete(
      [],
      {
        engineGatewayUrl: "host:1",
        graphName: "g1",
        setEdges: vi.fn(),
        nodeRegistry: makeMockNodeRegistry(),
        editorModelUpdater,
      },
      noopSnackbar,
    )
    expect(graphRemoveNode).not.toHaveBeenCalled()
    expect(editorModelUpdater.removeNode).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// cleanupOrphanWaypoints (Set version regression)
// ---------------------------------------------------------------------------

describe("cleanupOrphanWaypoints (Set)", () => {
  it("removes only waypoints unique to the deleted edges", () => {
    const wpOrphan = "$wp:orphan"
    const wpShared = "$wp:shared"
    const deleted = makeEngineEdge("A.out-B.in", "A", "B", "out", "in", {
      waypointIds: [wpOrphan, wpShared],
    })
    const surviving = makeEngineEdge("C.out-D.in", "C", "D", "out", "in", {
      waypointIds: [wpShared],
    })
    const setNodes = vi.fn()
    const editorModelUpdater = makeMockEditorModelUpdater()
    cleanupOrphanWaypoints(
      new Set(["A.out-B.in"]),
      [deleted, surviving],
      setNodes,
      editorModelUpdater,
    )
    expect(editorModelUpdater.removeNode).toHaveBeenCalledTimes(1)
    expect(editorModelUpdater.removeNode).toHaveBeenCalledWith(wpOrphan)
  })

  it("is no-op when deleted edges have no waypoints", () => {
    const edge = makeEngineEdge("A.out-B.in", "A", "B")
    const setNodes = vi.fn()
    const editorModelUpdater = makeMockEditorModelUpdater()
    cleanupOrphanWaypoints(
      new Set(["A.out-B.in"]),
      [edge],
      setNodes,
      editorModelUpdater,
    )
    expect(setNodes).not.toHaveBeenCalled()
    expect(editorModelUpdater.removeNode).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// cleanupWaypointsFromEdgesBatch
// ---------------------------------------------------------------------------

describe("cleanupWaypointsFromEdgesBatch", () => {
  it("removes editor_edges entry when engine edge loses all waypoints", () => {
    const wp = "$wp:1"
    const edge = makeEngineEdge("A.out-B.in", "A", "B", "out", "in", {
      waypointIds: [wp],
    })
    const editorModelUpdater = makeMockEditorModelUpdater()
    const setEdges = vi.fn((updater: (prev: Edge[]) => Edge[]) => updater([edge]))
    cleanupWaypointsFromEdgesBatch(new Set([wp]), setEdges, editorModelUpdater)
    expect(editorModelUpdater.removeEditorEdge).toHaveBeenCalledWith("A:out-B:in")
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("PUTs updated waypoints if some remain", () => {
    const wp1 = "$wp:1"
    const wp2 = "$wp:2"
    const edge = makeEngineEdge("A.out-B.in", "A", "B", "out", "in", {
      waypointIds: [wp1, wp2],
    })
    const editorModelUpdater = makeMockEditorModelUpdater()
    const setEdges = vi.fn((updater: (prev: Edge[]) => Edge[]) => updater([edge]))
    cleanupWaypointsFromEdgesBatch(new Set([wp1]), setEdges, editorModelUpdater)
    expect(editorModelUpdater.removeEditorEdge).not.toHaveBeenCalled()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain("editor_edges.A:out-B:in")
    expect(call[1].method).toBe("PUT")
    expect(JSON.parse(call[1].body).waypoints).toEqual([wp2])
  })

  it("PUTs (does not delete) for editor edges even when waypoints empty", () => {
    const wp = "$wp:1"
    const edge = makeEditorEdge(
      "$editor:T:t-$input:i",
      "$editor:T",
      "$input:i",
      "t",
      null,
      { waypointIds: [wp] },
    )
    const editorModelUpdater = makeMockEditorModelUpdater()
    const setEdges = vi.fn((updater: (prev: Edge[]) => Edge[]) => updater([edge]))
    cleanupWaypointsFromEdgesBatch(new Set([wp]), setEdges, editorModelUpdater)
    // Editor edge needs to keep its editor_edges entry even with no waypoints.
    expect(editorModelUpdater.removeEditorEdge).not.toHaveBeenCalled()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it("does not touch edges that don't reference any deleted waypoint", () => {
    const wp = "$wp:1"
    const unrelated = makeEngineEdge("C.out-D.in", "C", "D", "out", "in", {
      waypointIds: ["$wp:other"],
    })
    const editorModelUpdater = makeMockEditorModelUpdater()
    const setEdges = vi.fn((updater: (prev: Edge[]) => Edge[]) => updater([unrelated]))
    cleanupWaypointsFromEdgesBatch(new Set([wp]), setEdges, editorModelUpdater)
    expect(editorModelUpdater.removeEditorEdge).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("is no-op for empty deletedWaypointIds", () => {
    const editorModelUpdater = makeMockEditorModelUpdater()
    const setEdges = vi.fn()
    cleanupWaypointsFromEdgesBatch(new Set(), setEdges, editorModelUpdater)
    expect(setEdges).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(editorModelUpdater.removeEditorEdge).not.toHaveBeenCalled()
  })
})
