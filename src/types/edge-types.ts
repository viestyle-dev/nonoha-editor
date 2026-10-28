import { Edge } from "@xyflow/react"

export type BasicEdge = Edge<{
  source: {
    type: "node" | "output" | "input" | "editor" | "waypoint"
  }
  target: {
    type: "node" | "output" | "input" | "editor" | "waypoint"
  }
  valid?: boolean
  waypointIds?: string[]
  highlighted?: boolean
  editorModelUrl?: string
}>
