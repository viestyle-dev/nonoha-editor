import { BasicEngineNode } from "@/src/nodes/engine-nodes/basic-engine-node"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"

import { LineChartGraphNode } from "@/src/nodes/editor-nodes/line-chart-graph-node"
import { Log10LineChartGraphNode } from "@/src/nodes/editor-nodes/log10-line-chart-graph-node"
import { TimeSeriesGraphNode } from "@/src/nodes/editor-nodes/time-series-graph-node"
import { FastTimeSeriesGraphNode } from "@/src/nodes/editor-nodes/fast-time-series-graph-node"
import { FastLineChartGraphNode } from "@/src/nodes/editor-nodes/fast-line-chart-graph-node"
import { FastLog10LineChartGraphNode } from "@/src/nodes/editor-nodes/fast-log10-line-chart-graph-node"
import { TriggerNode } from "@/src/nodes/editor-nodes/trigger-node"
import { LabeledNumberDisplayNode } from "@/src/nodes/editor-nodes/labeled-number-display-node"
import { CommentNode } from "@/src/nodes/editor-nodes/comment-node"
import { ValuesInputNode } from "@/src/nodes/editor-nodes/values-input-node"
import { ValuesListDisplayNode } from "@/src/nodes/editor-nodes/values-list-display-node"
import { ScatterPlotNode } from "@/src/nodes/editor-nodes/scatter-plot-node"
import { NumberInputNode } from "@/src/nodes/editor-nodes/number-input-node"
import { CameraCaptureNode } from "@/src/nodes/editor-nodes/camera-capture-node"
import { StringInputNode } from "@/src/nodes/editor-nodes/string-input-node"
import { FaderNode } from "@/src/nodes/editor-nodes/fader-node"
import { BytesDisplayNode } from "@/src/nodes/editor-nodes/bytes-display-node"
import { ColorDisplayNode } from "@/src/nodes/editor-nodes/color-display-node"
import { HeatmapGraphNode } from "@/src/nodes/editor-nodes/heatmap-graph-node"
import { FastHeatmapGraphNode } from "@/src/nodes/editor-nodes/fast-heatmap-graph-node"
import { ImageDisplayNode } from "@/src/nodes/editor-nodes/image-display-node"
import { ValuesLogDisplayNode } from "@/src/nodes/editor-nodes/values-log-display-node"
import { WaypointNode } from "@/src/nodes/editor-nodes/waypoint-node"

import { GraphNode } from "@/src/nodes/graph-node"
import BasicNodeEdge from "@/src/components/basic-node-edge"
import type { Node } from "@xyflow/react"

/**
 * React Flow node type registry.
 * Maps node type names to their React components.
 */
export const NODE_TYPES = {
  BasicEngineNode,
  BasicPortNode,
  LineChartGraphNode,
  Log10LineChartGraphNode,
  TimeSeriesGraphNode,
  FastTimeSeriesGraphNode,
  FastLineChartGraphNode,
  FastLog10LineChartGraphNode,
  ScatterPlotNode,
  GraphNode,
  ValuesInputNode,
  TriggerNode,
  LabeledNumberDisplayNode,
  ValuesListDisplayNode,
  CommentNode,
  CameraCaptureNode,
  NumberInputNode,
  StringInputNode,
  FaderNode,
  BytesDisplayNode,
  ColorDisplayNode,
  HeatmapGraphNode,
  FastHeatmapGraphNode,
  ImageDisplayNode,
  ValuesLogDisplayNode,
  WaypointNode,
} as const

/**
 * React Flow edge type registry.
 * Maps edge type names to their React components.
 */
export const EDGE_TYPES = {
  BasicNodeEdge,
} as const

/**
 * Mapping from engine node types to variant overrides.
 * Nodes not listed here default to "normal" variant.
 */
const ENGINE_NODE_VARIANTS: Readonly<Record<string, "compact" | "value">> = {
  RealNumberValue: "value",
  ComplexNumberValue: "value",
  StringValue: "value",
  ArrayValue: "value",
  Compose: "compact",
  Decompose: "compact",
  Sequence: "compact",
  ValuesLatch: "compact",
}

/**
 * Returns the variant for a given engine node type.
 * Falls back to "normal" if no specific mapping exists.
 */
export function getEngineNodeVariant(nodeType: string): "normal" | "compact" | "value" {
  return ENGINE_NODE_VARIANTS[nodeType] ?? "normal"
}

/**
 * Returns the UI component type for a given engine node type.
 * All engine nodes now use "BasicEngineNode" with variant-based rendering.
 */
export function getEngineNodeUIType(nodeType: string): string {
  return "BasicEngineNode"
}

/**
 * Default React Flow node properties per node type.
 * Applied by makeEditorNode via spread.
 * Node's explicit properties take precedence over defaults.
 */
export const NODE_TYPE_DEFAULTS: Record<string, Record<string, unknown>> = {
  CommentNode: { zIndex: -1 },
}

/**
 * Constructs an editor node with type-specific defaults applied.
 * Explicit properties in `node` take precedence over NODE_TYPE_DEFAULTS.
 */
export function makeEditorNode(node: Node): Node {
  const typeDefaults = NODE_TYPE_DEFAULTS[node.type ?? ""]
  if (!typeDefaults) {
    return node
  }
  return { ...typeDefaults, ...node }
}
