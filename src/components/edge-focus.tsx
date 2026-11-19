"use client"

import { Edge, ReactFlowState, useStore } from "@xyflow/react"
import { useMemo } from "react"

import { HIDDEN_EDGE_CLASS } from "@/src/components/basic-node-edge"

/**
 * Traces links: while nodes, waypoints or edges are selected, the edges that
 * do not touch them fade and the references and displays that do (otherwise
 * not drawn, see edge-drawing.ts) show as dashed lines, so where their values
 * come from and go stand out. Only a selection does it (an intent): moving
 * the pointer changes nothing. One <style> switches it: no edge re-renders.
 * A node without edges (or the $graph frame) fades nothing.
 */

const FADED_OPACITY = 0.15

const nodesSelector = (s: ReactFlowState) => s.nodes
const edgesSelector = (s: ReactFlowState) => s.edges

function touches(edge: Edge, nodeId: string): boolean {
  if (edge.source === nodeId || edge.target === nodeId) return true
  const waypointIds = (edge.data as Record<string, unknown> | undefined)?.waypointIds as string[] | undefined
  return waypointIds !== undefined && waypointIds.includes(nodeId)
}

export function EdgeFocus() {
  const nodes = useStore(nodesSelector)
  const edges = useStore(edgesSelector)

  const rules = useMemo(() => {
    const nodeIds: string[] = []
    for (const node of nodes) if (node.selected) nodeIds.push(node.id)
    const selectedEdge = edges.some(edge => edge.selected)
    if (nodeIds.length === 0 && !selectedEdge) return ""
    const kept: string[] = []
    for (const edge of edges) {
      if (edge.selected || nodeIds.some(nodeId => touches(edge, nodeId))) {
        kept.push(`.react-flow__edge[data-id="${CSS.escape(edge.id)}"]`)
      }
    }
    if (kept.length === 0) return ""
    return (
      `.react-flow__edges .react-flow__edge { opacity: ${FADED_OPACITY}; }\n${kept.join(",\n")} { opacity: 1; }\n` +
      `${kept.map(edge => `${edge} path.${HIDDEN_EDGE_CLASS}`).join(",\n")} { display: inline; }`
    )
  }, [nodes, edges])

  return (
    <style>{`.react-flow__edge { transition: opacity 0.15s; }\n.react-flow__edge path.${HIDDEN_EDGE_CLASS} { display: none; }\n${rules}`}</style>
  )
}
