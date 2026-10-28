import type { NodePrototype } from "@/src/components/node-add-menu"
import type { GraphEndpoint } from "nonoha-client-js"
import type { EditorModelUpdater } from "@/src/api/editor-model-updater"

/**
 * Creates an array of editor node prototypes.
 * These are used in the node add menu to create new editor nodes.
 *
 * @param graphEndpoint - The graph endpoint for API communication
 * @param editorModelUpdater - The updater for editor model changes
 * @returns Array of node prototypes for the add menu
 */
export function makeNodePrototypes(
  graphEndpoint: GraphEndpoint,
  editorModelUpdater: EditorModelUpdater
): NodePrototype[] {
  // Shared data for all editor nodes
  const commonData = { graphEndpoint, editorModelUpdater }

  return [
    {
      id: "$editor:TimeSeriesGraphNode",
      data: { label: "TimeSeriesGraph", ...commonData },
      type: "TimeSeriesGraphNode",
    },
    {
      id: "$editor:FastTimeSeriesGraphNode",
      data: { label: "FastTimeSeriesGraph", ...commonData },
      type: "FastTimeSeriesGraphNode",
    },
    {
      id: "$editor:LineChartGraphNode",
      data: { label: "LineChartGraph", ...commonData },
      type: "LineChartGraphNode",
    },
    {
      id: "$editor:Log10LineChartGraphNode",
      data: { label: "Log10LineChartGraph", ...commonData },
      type: "Log10LineChartGraphNode",
    },
    {
      id: "$editor:FastLineChartGraphNode",
      data: { label: "FastLineChartGraph", ...commonData },
      type: "FastLineChartGraphNode",
    },
    {
      id: "$editor:FastLog10LineChartGraphNode",
      data: { label: "FastLog10LineChartGraph", ...commonData },
      type: "FastLog10LineChartGraphNode",
    },
    {
      id: "$editor:HeatmapGraphNode",
      data: { label: "HeatmapGraph", ...commonData },
      type: "HeatmapGraphNode",
    },
    {
      id: "$editor:FastHeatmapGraphNode",
      data: { label: "FastHeatmapGraph", ...commonData },
      type: "FastHeatmapGraphNode",
    },
    {
      id: "$editor:ScatterPlotNode",
      data: { label: "ScatterPlot", ...commonData },
      type: "ScatterPlotNode",
    },
    {
      id: "$editor:NumberInputNode",
      data: { label: "NumberInput", ...commonData },
      type: "NumberInputNode",
    },
    {
      id: "$editor:StringInputNode",
      data: { label: "StringInput", ...commonData },
      type: "StringInputNode",
    },
    {
      id: "$editor:FaderNode",
      data: { label: "Fader", ...commonData },
      type: "FaderNode",
    },
    {
      id: "$editor:ValuesInputNode",
      data: { label: "ValuesInput", ...commonData },
      type: "ValuesInputNode",
    },
    {
      id: "$editor:TriggerNode",
      data: { label: "Trigger", ...commonData },
      type: "TriggerNode",
    },
    {
      id: "$editor:LabeledNumberDisplayNode",
      data: { label: "LabeledNumberDisplay", ...commonData },
      type: "LabeledNumberDisplayNode",
    },
    {
      id: "$editor:ValuesListDisplayNode",
      data: { label: "ValuesListDisplay", ...commonData },
      type: "ValuesListDisplayNode",
      style: { width: 200, height: 150 },
    },
    {
      id: "$editor:ValuesLogDisplayNode",
      data: { label: "ValuesLogDisplay", ...commonData },
      type: "ValuesLogDisplayNode",
      style: { width: 200, height: 150 },
    },
    {
      id: "$editor:BytesDisplayNode",
      data: { label: "BytesDisplay", ...commonData },
      type: "BytesDisplayNode",
    },
    {
      id: "$editor:ColorDisplayNode",
      data: { label: "ColorDisplay", ...commonData },
      type: "ColorDisplayNode",
    },
    {
      id: "$editor:CommentNode",
      data: { label: "Comment", ...commonData },
      type: "CommentNode",
    },
    {
      id: "$editor:CameraCaptureNode",
      data: { label: "CameraCapture", ...commonData },
      type: "CameraCaptureNode",
    },
    {
      id: "$editor:ImageDisplayNode",
      data: { label: "ImageDisplay", ...commonData },
      type: "ImageDisplayNode",
      style: { width: 320, height: 280 },
    },
  ]
}
