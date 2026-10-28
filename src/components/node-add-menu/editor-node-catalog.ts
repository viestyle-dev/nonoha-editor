export interface EditorNodeMetadata {
  type: string
  label: string
  description: string
  category: string
  inputs: { name: string; types: string[]; description: string }[]
  outputs: { name: string; types: string[]; description: string }[]
}

export const EDITOR_NODE_CATALOG: Record<string, EditorNodeMetadata> = {
  TimeSeriesGraphNode: {
    type: "TimeSeriesGraphNode",
    label: "TimeSeriesGraph",
    description: "Displays time-series data as a scrolling line chart using Plotly",
    category: "Visualization",
    inputs: [
      { name: "data", types: ["any"], description: "Numeric data to plot over time" },
    ],
    outputs: [],
  },
  FastTimeSeriesGraphNode: {
    type: "FastTimeSeriesGraphNode",
    label: "FastTimeSeriesGraph",
    description: "High-performance time-series graph using uPlot for large datasets",
    category: "Visualization",
    inputs: [
      { name: "data", types: ["any"], description: "Numeric data to plot over time" },
      { name: "rec", types: ["bool"], description: "Recording gate: records only while the connected state signal is true (resyncable after reconnect; the node's AUTO/MANUAL toggle can suspend signal control)" },
      { name: "clear", types: ["bool"], description: "Clears the plot on the false->true rising edge of the connected state signal. Wire the same signal (e.g. meditation_active) to both rec and clear for a fresh window per session. The node's AUTO/MANUAL toggle can suspend signal control" },
    ],
    outputs: [],
  },
  LineChartGraphNode: {
    type: "LineChartGraphNode",
    label: "LineChartGraph",
    description: "Displays data as a static line chart with X/Y axes",
    category: "Visualization",
    inputs: [
      { name: "data", types: ["any"], description: "Array data to plot" },
    ],
    outputs: [],
  },
  Log10LineChartGraphNode: {
    type: "Log10LineChartGraphNode",
    label: "Log10LineChartGraph",
    description: "Line chart with logarithmic (base 10) Y-axis scale",
    category: "Visualization",
    inputs: [
      { name: "data", types: ["any"], description: "Array data to plot on log scale" },
    ],
    outputs: [],
  },
  FastLineChartGraphNode: {
    type: "FastLineChartGraphNode",
    label: "FastLineChartGraph",
    description: "High-performance line chart using uPlot",
    category: "Visualization",
    inputs: [
      { name: "xLabels", types: ["any"], description: "X-axis values" },
      { name: "traces", types: ["any"], description: "Y-axis trace data (1D or 2D arrays)" },
      { name: "rec", types: ["bool"], description: "Recording gate: records only while the connected state signal is true (the node's AUTO/MANUAL toggle can suspend signal control)" },
    ],
    outputs: [],
  },
  FastLog10LineChartGraphNode: {
    type: "FastLog10LineChartGraphNode",
    label: "FastLog10LineChartGraph",
    description: "High-performance line chart with log10 axis support",
    category: "Visualization",
    inputs: [
      { name: "xLabels", types: ["any"], description: "X-axis values" },
      { name: "traces", types: ["any"], description: "Y-axis trace data (1D or 2D arrays)" },
      { name: "rec", types: ["bool"], description: "Recording gate: records only while the connected state signal is true (the node's AUTO/MANUAL toggle can suspend signal control)" },
    ],
    outputs: [],
  },
  HeatmapGraphNode: {
    type: "HeatmapGraphNode",
    label: "HeatmapGraph",
    description: "Displays 2D data as a color-coded heatmap",
    category: "Visualization",
    inputs: [
      { name: "data", types: ["any"], description: "2D array data for heatmap" },
      { name: "rec", types: ["bool"], description: "Recording gate: records only while the connected state signal is true (resyncable after reconnect; the node's AUTO/MANUAL toggle can suspend signal control)" },
      { name: "clear", types: ["bool"], description: "Clears the plot on the false->true rising edge of the connected state signal. Wire the same signal (e.g. meditation_active) to both rec and clear for a fresh window per session. The node's AUTO/MANUAL toggle can suspend signal control" },
    ],
    outputs: [],
  },
  FastHeatmapGraphNode: {
    type: "FastHeatmapGraphNode",
    label: "FastHeatmapGraph",
    description: "High-performance scrolling heatmap using uPlot (ImageData raster)",
    category: "Visualization",
    inputs: [
      { name: "series", types: ["any"], description: "2D array data [batch, yLength]; each batch row becomes one column" },
      { name: "yLabels", types: ["f32"], description: "Y-axis values for the data rows (e.g. frequencies), 2D f32 array" },
      { name: "rec", types: ["bool"], description: "Recording gate: records only while the connected state signal is true (resyncable after reconnect; the node's AUTO/MANUAL toggle can suspend signal control)" },
      { name: "clear", types: ["bool"], description: "Clears the plot on the false->true rising edge of the connected state signal. Wire the same signal (e.g. meditation_active) to both rec and clear for a fresh window per session. The node's AUTO/MANUAL toggle can suspend signal control" },
    ],
    outputs: [],
  },
  ScatterPlotNode: {
    type: "ScatterPlotNode",
    label: "ScatterPlot",
    description: "Displays data points as a scatter plot",
    category: "Visualization",
    inputs: [
      { name: "data", types: ["any"], description: "X/Y coordinate data" },
    ],
    outputs: [],
  },
  ImageDisplayNode: {
    type: "ImageDisplayNode",
    label: "ImageDisplay",
    description: "Displays image data (e.g., from camera or processing)",
    category: "Visualization",
    inputs: [
      { name: "image", types: ["u8"], description: "Image data to display" },
    ],
    outputs: [],
  },
  NumberInputNode: {
    type: "NumberInputNode",
    label: "NumberInput",
    description: "Text field for entering a numeric value",
    category: "Input",
    inputs: [],
    outputs: [
      { name: "value", types: ["any"], description: "The entered number" },
    ],
  },
  StringInputNode: {
    type: "StringInputNode",
    label: "StringInput",
    description: "Text field for entering a string value",
    category: "Input",
    inputs: [],
    outputs: [
      { name: "value", types: ["str"], description: "The entered string" },
    ],
  },
  FaderNode: {
    type: "FaderNode",
    label: "Fader",
    description: "Slider control for adjusting a numeric value",
    category: "Input",
    inputs: [],
    outputs: [
      { name: "value", types: ["any"], description: "Current slider value" },
    ],
  },
  ValuesInputNode: {
    type: "ValuesInputNode",
    label: "ValuesInput",
    description: "Input field for entering multiple comma-separated values",
    category: "Input",
    inputs: [],
    outputs: [
      { name: "values", types: ["any"], description: "Array of entered values" },
    ],
  },
  TriggerNode: {
    type: "TriggerNode",
    label: "Trigger",
    description: "Button that sends a trigger signal when pressed",
    category: "Input",
    inputs: [],
    outputs: [
      { name: "trigger", types: ["bool"], description: "Trigger signal" },
    ],
  },
  CameraCaptureNode: {
    type: "CameraCaptureNode",
    label: "CameraCapture",
    description: "Captures video from a webcam or camera device",
    category: "Input",
    inputs: [],
    outputs: [
      { name: "image", types: ["u8"], description: "Captured image frame" },
    ],
  },
  LabeledNumberDisplayNode: {
    type: "LabeledNumberDisplayNode",
    label: "LabeledNumberDisplay",
    description: "Displays a numeric value with a label",
    category: "Display",
    inputs: [
      { name: "value", types: ["any"], description: "Number to display" },
    ],
    outputs: [],
  },
  ValuesListDisplayNode: {
    type: "ValuesListDisplayNode",
    label: "ValuesListDisplay",
    description: "Displays an array of values as a scrollable list",
    category: "Display",
    inputs: [
      { name: "values", types: ["any"], description: "Array data to display" },
    ],
    outputs: [],
  },
  BytesDisplayNode: {
    type: "BytesDisplayNode",
    label: "BytesDisplay",
    description: "Displays raw byte data in hexadecimal format",
    category: "Display",
    inputs: [
      { name: "data", types: ["u8"], description: "Byte data to display" },
    ],
    outputs: [],
  },
  ColorDisplayNode: {
    type: "ColorDisplayNode",
    label: "ColorDisplay",
    description: "Displays a color preview from RGB values",
    category: "Display",
    inputs: [
      { name: "color", types: ["any"], description: "RGB color values" },
    ],
    outputs: [],
  },
  ValuesLogDisplayNode: {
    type: "ValuesLogDisplayNode",
    label: "ValuesLogDisplay",
    description: "Accumulates received values over time in a scrollable log",
    category: "Display",
    inputs: [
      { name: "values", types: ["any"], description: "Values to accumulate" },
    ],
    outputs: [],
  },
  CommentNode: {
    type: "CommentNode",
    label: "Comment",
    description: "Text annotation for documenting the graph",
    category: "Utility",
    inputs: [],
    outputs: [],
  },
}
