"use client"

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Node, ReactFlowState, useStore, useStoreApi } from "@xyflow/react"
import {
  edgeDrawings,
  outputKey,
  type DrawAs,
  type EdgeDrawing,
  type EdgeDrawings,
} from "@/src/lib/graph/edge-drawing"

/**
 * The graph's edge drawings (see edge-drawing.ts), one store per graph
 * (EdgeDrawingsProvider) shared by every edge and waypoint. React Flow's
 * store changes on every pan frame and drag update, and calls every
 * subscriber's selector then; the drawings change only with the edges or a
 * node's data (it carries the node's outputs' `drawAs`). So the one store
 * recomputes them when the edges or a node's data change (not on a drag step)
 * and tells the edges and waypoints only when the result differs.
 *
 * The provider also finds React Flow's edge label layer once, for
 * EdgeLabelPortal: React Flow's EdgeLabelRenderer looks it up with a
 * querySelector on every store change, once per label.
 */

interface Drawings extends EdgeDrawings {
  /** Per waypoint: "<edges>|<lines>" through it (references and displays are not drawn). */
  waypoints: ReadonlyMap<string, string>
}

type FlowStore = ReturnType<typeof useStoreApi>

export function drawAsOf(state: ReactFlowState) {
  return (source: string, sourceHandle: string | null | undefined): DrawAs | undefined =>
    (state.nodeLookup.get(source)?.data as { drawAs?: Record<string, DrawAs> } | undefined)?.drawAs?.[
      sourceHandle ?? ""
    ]
}

/** Same nodes in the same order with the same `data` objects (positions may differ). */
function sameNodeData(a: readonly Node[], b: readonly Node[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; ++i) if (a[i].id !== b[i].id || a[i].data !== b[i].data) return false
  return true
}

/** The drawings and a signature of all of them (equal signatures: nothing to tell). */
function compute(state: ReactFlowState): [Drawings, string] {
  const base = edgeDrawings(state.edges, drawAsOf(state))
  const use = new Map<string, [number, number]>()
  let signature = ""
  for (const edge of state.edges) {
    const drawing = base.of.get(edge.id) ?? "line"
    signature += `${edge.id}:${drawing};`
    const ids = (edge.data as Record<string, unknown> | undefined)?.waypointIds as string[] | undefined
    if (!ids) continue
    const line = drawing === "line" ? 1 : 0
    for (const id of ids) {
      const counts = use.get(id) ?? [0, 0]
      use.set(id, [counts[0] + 1, counts[1] + line])
    }
  }
  base.outputs.forEach((marks, key) => (signature += `${key}:${marks.references}|${marks.displays}|${marks.markEdge};`))
  const waypoints = new Map<string, string>()
  use.forEach(([all, lines], id) => {
    waypoints.set(id, `${all}|${lines}`)
    signature += `${id}:${all}|${lines};`
  })
  return [{ ...base, waypoints }, signature]
}

class DrawingsStore {
  drawings: Drawings
  private signature: string
  private edges: unknown
  private nodes: readonly Node[]
  private readonly listeners = new Set<() => void>()

  constructor(private readonly flow: FlowStore) {
    const state = flow.getState()
    this.edges = state.edges
    this.nodes = state.nodes
    ;[this.drawings, this.signature] = compute(state)
  }

  /** Follow React Flow's store until the returned function is called. */
  connect(): () => void {
    this.update(this.flow.getState())
    return this.flow.subscribe(state => this.update(state))
  }

  private update(state: ReactFlowState): void {
    if (state.edges === this.edges && state.nodes === this.nodes) return // a pan frame
    const sameData = state.edges === this.edges && sameNodeData(state.nodes, this.nodes)
    this.edges = state.edges
    this.nodes = state.nodes
    if (sameData) return // a drag step or a selection: drawings read node data only
    const [drawings, signature] = compute(state)
    if (signature === this.signature) return // e.g. a node dragged
    this.drawings = drawings
    this.signature = signature
    this.listeners.forEach(listener => listener())
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

interface EdgeDrawingsContextValue {
  store: DrawingsStore
  /** React Flow's edge label layer, once it is mounted. */
  labels: HTMLElement | null
}

const EdgeDrawingsContext = createContext<EdgeDrawingsContextValue | null>(null)

const domNodeSelector = (s: ReactFlowState) => s.domNode

/** One drawings store and the edge label layer for the graph; wraps <ReactFlow> inside its ReactFlowProvider. */
export function EdgeDrawingsProvider({ children }: { children: ReactNode }) {
  const flow = useStoreApi()
  const [store] = useState(() => new DrawingsStore(flow))
  useEffect(() => store.connect(), [store])
  const domNode = useStore(domNodeSelector)
  const labels = useMemo(
    () => domNode?.querySelector<HTMLElement>(".react-flow__edgelabel-renderer") ?? null,
    [domNode],
  )
  const value = useMemo(() => ({ store, labels }), [store, labels])
  return <EdgeDrawingsContext.Provider value={value}>{children}</EdgeDrawingsContext.Provider>
}

function useEdgeDrawingsContext(): EdgeDrawingsContextValue {
  const value = useContext(EdgeDrawingsContext)
  if (!value) throw new Error("EdgeDrawingsProvider is missing around <ReactFlow>")
  return value
}

/** Renders `children` in React Flow's edge label layer (as EdgeLabelRenderer, without its per-label lookup). */
export function EdgeLabelPortal({ children }: { children: ReactNode }) {
  const { labels } = useEdgeDrawingsContext()
  return labels ? createPortal(children, labels) : null
}

export function useEdgeDrawing(edgeId: string): EdgeDrawing {
  const { store } = useEdgeDrawingsContext()
  const snapshot = useCallback(() => store.drawings.of.get(edgeId) ?? "line", [store, edgeId])
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

/**
 * The marks this edge draws at its source output: "<references>|<displays>",
 * or "" when another edge of the same output draws them (one set per output).
 */
export function useOutputMarks(edgeId: string, source: string, sourceHandle: string | null | undefined): string {
  const { store } = useEdgeDrawingsContext()
  const snapshot = useCallback(() => {
    const marks = store.drawings.outputs.get(outputKey(source, sourceHandle))
    return marks && marks.markEdge === edgeId ? `${marks.references}|${marks.displays}` : ""
  }, [store, edgeId, source, sourceHandle])
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

/** "<edges>|<lines>" through a waypoint. */
export function useWaypointUse(waypointId: string): string {
  const { store } = useEdgeDrawingsContext()
  const snapshot = useCallback(() => store.drawings.waypoints.get(waypointId) ?? "0|0", [store, waypointId])
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}
