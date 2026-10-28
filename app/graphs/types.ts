/**
 * Type definitions for the graph editor page.
 * These types are used for copy/paste functionality and node data structures.
 */

/**
 * Node data stored in clipboard during copy/paste operations.
 */
export interface ClipboardNodeData {
  name: string
  type: string
  nodeType: "node" | "editor" | "input" | "output" | "waypoint"
  properties: { [key: string]: string | number | boolean }
  inputs?: Array<{
    name: string
    values: Array<{
      name?: string | null
      type?: string
      dispatch_flag?: boolean
    }>
  }>
  position: {
    x: number
    y: number
  }
  editorData?: {
    width?: number
    height?: number
    data?: Record<string, unknown>
  }
  portData?: {
    portName: string
    values?: Array<{ type: string }>
    defaultValue?: unknown
  }
}

/**
 * Edge data stored in clipboard during copy/paste operations.
 */
export interface ClipboardEdgeData {
  source: string
  target: string
  sourceNodeType?: "node" | "editor" | "input" | "output" | "waypoint"
  targetNodeType?: "node" | "editor" | "input" | "output" | "waypoint"
  /**
   * Old waypoint node IDs the edge references, filtered to only those
   * also present in the same clipboard snapshot. Waypoints outside the
   * selection are dropped so paste never produces ghost references.
   */
  waypoints?: string[]
}

/**
 * Complete clipboard data structure for copy/paste.
 */
export interface ClipboardData {
  nodes: ClipboardNodeData[]
  edges: ClipboardEdgeData[]
}

/**
 * Request data for creating a new node via API.
 */
export interface CreateNodeRequestData {
  type: string
  preferred_name?: string
  properties?: { [key: string]: string | number | boolean }
}

/**
 * Structure of node data within React Flow nodes.
 */
export interface NodeDataStructure {
  nodeData?: {
    type?: string
    properties?: { [key: string]: string | number | boolean }
    inputs?: Array<{
      name: string
      values: Array<{
        name?: string | null
        type?: string
        dispatch_flag?: boolean
      }>
    }>
  }
  label?: string
  [key: string]: unknown
}

/**
 * Response from node creation API.
 */
export interface CreatedNodeResponse {
  name: string
  type: string
  properties: { [key: string]: string | number | boolean }
  inputs?: unknown[]
  outputs?: unknown[]
}
