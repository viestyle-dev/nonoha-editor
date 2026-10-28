import { describe, it, expect } from "vitest"
import {
  generateUniqueSuffix,
  generateEditorNodeId,
  extractNodeTypeFromId,
} from "../id-generator"

describe("generateUniqueSuffix", () => {
  it("returns a non-empty string", () => {
    const suffix = generateUniqueSuffix()
    expect(suffix.length).toBeGreaterThan(10)
  })

  it("returns unique values on successive calls", () => {
    const a = generateUniqueSuffix()
    const b = generateUniqueSuffix()
    expect(a).not.toBe(b)
  })

  it("contains only base36 characters", () => {
    const suffix = generateUniqueSuffix()
    expect(suffix).toMatch(/^[0-9a-z]+$/)
  })
})

describe("generateEditorNodeId", () => {
  it("starts with $editor: prefix", () => {
    const id = generateEditorNodeId("CommentNode")
    expect(id).toMatch(/^\$editor:CommentNode_/)
  })

  it("includes the node type", () => {
    const id = generateEditorNodeId("TriggerNode")
    expect(id).toContain("TriggerNode")
  })
})

describe("extractNodeTypeFromId", () => {
  it("extracts type from valid editor node ID", () => {
    expect(extractNodeTypeFromId("$editor:CommentNode_abc123")).toBe(
      "CommentNode",
    )
  })

  it("extracts type with multiple underscores", () => {
    expect(extractNodeTypeFromId("$editor:My_Custom_Node_abc123")).toBe(
      "My_Custom_Node",
    )
  })

  it("returns null for non-editor ID", () => {
    expect(extractNodeTypeFromId("NodeA")).toBeNull()
  })

  it("returns null for input/output IDs", () => {
    expect(extractNodeTypeFromId("$input:portName")).toBeNull()
    expect(extractNodeTypeFromId("$output:portName")).toBeNull()
  })
})
