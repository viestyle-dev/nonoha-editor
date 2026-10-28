import { describe, it, expect } from "vitest"
import { getNodeType } from "../graph-api"

describe("getNodeType", () => {
  it("returns 'input' for $input: prefix", () => {
    expect(getNodeType("$input:portName")).toBe("input")
  })

  it("returns 'output' for $output: prefix", () => {
    expect(getNodeType("$output:portName")).toBe("output")
  })

  it("returns 'editor' for $editor: prefix", () => {
    expect(getNodeType("$editor:CommentNode_abc123")).toBe("editor")
  })

  it("returns 'waypoint' for $wp: prefix", () => {
    expect(getNodeType("$wp:abc123_def4")).toBe("waypoint")
  })

  it("returns 'node' for engine node names", () => {
    expect(getNodeType("RealNumberValue_1")).toBe("node")
    expect(getNodeType("BandPassFilter_25")).toBe("node")
  })

  it("returns 'node' for $graph", () => {
    // $graph doesn't match any prefix → falls through to "node"
    expect(getNodeType("$graph")).toBe("node")
  })
})
