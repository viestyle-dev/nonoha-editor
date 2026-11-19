"use client"

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react"
import {
  ActivityEntry,
  EngineCapabilities,
  InspectorClient,
  InspectorPortRef,
  InspectorStatus,
  WatchCallbacks,
  WatchHandle,
  WatchOptions,
} from "nonoha-client-js"
import type { ValueKind } from "./interpret"
import { formatHz } from "./value-renderers"
import { useEngineCapabilitiesFor } from "@/src/stores/engine-capabilities-store"

/**
 * The editor's side of the engine inspector: one InspectorClient per open
 * graph, shared by every port decoration, peek popover and dashed
 * (inspector-fed) display node.
 *
 * Activity: port components register while mounted; the set is sent to the
 * engine at most every FLUSH_MS. Each port re-renders only when its own
 * entry changes (useSyncExternalStore on a per-port version), never through
 * React Flow's setNodes.
 */

const DEFAULT_KEY = "nonoha-editor:inspector"
const FLUSH_MS = 150
const ACTIVITY_INTERVAL_MS = 500
const MAX_PREVIEW_SLOTS = 8 // in-node previews sampling at once
const CLIENT_NAME = `nonoha-editor/${process.env.NEXT_PUBLIC_EDITOR_VERSION ?? "dev"}`

export function readInspectorDefault(): boolean {
  try {
    return localStorage.getItem(DEFAULT_KEY) !== "off"
  } catch {
    return true
  }
}

function writeInspectorDefault(on: boolean): void {
  try {
    localStorage.setItem(DEFAULT_KEY, on ? "on" : "off")
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

export function portKey(ref: InspectorPortRef): string {
  return `${ref.node}\u0000${ref.dir}\u0000${ref.port}`
}

export interface InspectorUiState {
  /** undefined while the engine's capabilities load; false for engines without an inspector. */
  supported: boolean | undefined
  enabled: boolean
  status: InspectorStatus
}

export interface EdgeEndpoints {
  source: string
  sourceHandle: string | null
  target: string
  targetHandle: string | null
}

export interface PinRequest {
  ref: InspectorPortRef
  kind: ValueKind
  colorOrder?: "rgb" | "bgr"
}

type Listener = () => void

export class EditorInspector {
  readonly engineGatewayUrl: string
  readonly graphName: string
  /** Set by the graph page: creates the pinned display node and its dashed edge. */
  pinHandler: ((request: PinRequest) => void) | null = null
  /** Set by the graph page: turns a dashed edge into engine -> $output -> display. */
  promoteHandler: ((edge: EdgeEndpoints) => void) | null = null

  private client: InspectorClient | null = null
  private capabilities: EngineCapabilities | null | undefined = undefined
  private disposed = false
  private readonly ports = new Map<string, { ref: InspectorPortRef; count: number }>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly portListeners = new Map<string, Set<Listener>>()
  private readonly portVersions = new Map<string, number>()
  private readonly entryKeys = new WeakMap<ActivityEntry, string>()
  private readonly stateListeners = new Set<Listener>()
  private state: InspectorUiState
  private previewSlots = 0
  private readonly slotListeners = new Set<Listener>()
  /** Why a watched port shows nothing (too_large, gone, refused), until its next sample. */
  private readonly problems = new Map<string, string>()
  private readonly problemListeners = new Map<string, Set<Listener>>()
  private readonly watchCounts = new Map<string, number>()

  constructor(engineGatewayUrl: string, graphName: string) {
    this.engineGatewayUrl = engineGatewayUrl
    this.graphName = graphName
    this.state = {
      supported: undefined,
      enabled: readInspectorDefault(),
      status: { state: "idle", reasons: [] },
    }
  }

  /** The engine's capabilities (null: none, e.g. an engine before 1.1 or unreachable). */
  applyCapabilities(capabilities: EngineCapabilities | null): void {
    if (this.disposed) return
    this.capabilities = capabilities
    const supported = Boolean(capabilities?.inspector?.enabled)
    this.setState({ supported })
    if (supported) {
      if (this.state.enabled) this.connect()
    } else if (this.client) {
      this.client.close()
      this.client = null
      this.clearProblems()
      this.setState({ status: { state: "idle", reasons: [] } })
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.flushTimer !== null) clearTimeout(this.flushTimer)
    this.client?.close()
    this.client = null
    this.clearProblems()
    this.pinHandler = null
    this.promoteHandler = null
  }

  // --- enable / status -------------------------------------------------------------

  setEnabled(enabled: boolean): void {
    writeInspectorDefault(enabled)
    if (enabled === this.state.enabled) return
    this.setState({ enabled })
    if (enabled) {
      if (this.state.supported) this.connect()
    } else {
      this.client?.close()
      this.client = null
      this.clearProblems()
      this.setState({ status: { state: "idle", reasons: [] } })
    }
  }

  forceResume(): void {
    this.client?.forceResume()
  }

  get connected(): boolean {
    return this.client !== null
  }

  getState = (): InspectorUiState => this.state

  subscribeState = (listener: Listener): (() => void) => {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private setState(patch: Partial<InspectorUiState>): void {
    this.state = { ...this.state, ...patch }
    this.stateListeners.forEach(listener => listener())
  }

  private connect(): void {
    if (this.client || this.disposed || !this.capabilities?.inspector?.enabled) return
    const client = new InspectorClient(this.engineGatewayUrl, this.graphName, { clientName: CLIENT_NAME })
    client.onStatus(status => this.setState({ status }))
    client.onActivity(changed => this.onActivity(changed))
    client.setActivityPorts(this.portRefs(), ACTIVITY_INTERVAL_MS)
    client.connect()
    this.client = client
    this.setState({ status: client.status })
  }

  // --- activity --------------------------------------------------------------------

  /** Report activity for a port while the returned function is not called. */
  registerPort(ref: InspectorPortRef): () => void {
    const key = portKey(ref)
    const slot = this.ports.get(key)
    if (slot) slot.count++
    else {
      this.ports.set(key, { ref, count: 1 })
      this.scheduleFlush()
    }
    return () => {
      const current = this.ports.get(key)
      if (!current) return
      if (--current.count === 0) {
        this.ports.delete(key)
        this.scheduleFlush()
      }
    }
  }

  subscribePort(key: string, listener: Listener): () => void {
    let set = this.portListeners.get(key)
    if (!set) this.portListeners.set(key, (set = new Set()))
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.portListeners.delete(key)
    }
  }

  portVersion(key: string): number {
    return this.portVersions.get(key) ?? 0
  }

  activityOf(ref: InspectorPortRef): ActivityEntry | undefined {
    return this.client?.activityOf(ref)
  }

  private portRefs(): InspectorPortRef[] {
    const refs: InspectorPortRef[] = []
    this.ports.forEach(({ ref }) => refs.push(ref))
    return refs
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.client?.setActivityPorts(this.portRefs(), ACTIVITY_INTERVAL_MS)
    }, FLUSH_MS)
  }

  private onActivity(changed: readonly ActivityEntry[]): void {
    for (let i = 0; i < changed.length; ++i) {
      const entry = changed[i]
      let key = this.entryKeys.get(entry)
      if (key === undefined) {
        key = portKey(entry.ref)
        this.entryKeys.set(entry, key)
      }
      this.portVersions.set(key, (this.portVersions.get(key) ?? 0) + 1)
      const listeners = this.portListeners.get(key)
      if (listeners) listeners.forEach(listener => listener())
    }
  }

  // --- in-node previews -------------------------------------------------------------

  /**
   * Hold one of the MAX_PREVIEWS slots until the returned function is
   * called: `onGranted(true)` now, or `false` now and `true` once another
   * preview gives its slot back (taken once, not on every later release).
   */
  holdPreviewSlot(onGranted: (granted: boolean) => void): () => void {
    let held = this.takePreviewSlot()
    onGranted(held)
    if (held) return () => this.givePreviewSlot()
    const waiting: Listener = () => {
      if (held || !this.takePreviewSlot()) return
      held = true
      this.slotListeners.delete(waiting)
      onGranted(true)
    }
    this.slotListeners.add(waiting)
    return () => {
      this.slotListeners.delete(waiting)
      if (held) this.givePreviewSlot()
    }
  }

  private takePreviewSlot(): boolean {
    if (this.previewSlots >= MAX_PREVIEW_SLOTS) return false
    this.previewSlots++
    return true
  }

  private givePreviewSlot(): void {
    if (this.previewSlots > 0) this.previewSlots--
    this.slotListeners.forEach(listener => listener())
  }

  // --- watches ---------------------------------------------------------------------

  /**
   * Watch a port; null while the inspector is off or unsupported. What the
   * engine could not send for it (too_large, a port gone, a refused watch)
   * becomes the port's problem (`usePortProblem`) until its next sample.
   */
  watch(ref: InspectorPortRef, options: WatchOptions, callbacks: WatchCallbacks): WatchHandle | null {
    const client = this.client
    if (!client) return null
    const key = portKey(ref)
    const problems = this.problems
    const handle = client.watch(ref, options, {
      onSample: sample => {
        if (problems.has(key)) this.setProblem(key, null)
        callbacks.onSample(sample)
      },
      onInfo: callbacks.onInfo,
      onGone: () => {
        this.setProblem(key, "The port is gone (removed or replaced)")
        callbacks.onGone?.()
      },
      onError: (code, message) => {
        this.setProblem(key, code === "too_large" ? `Too large to show: ${message}` : message)
        callbacks.onError?.(code, message)
      },
    })
    this.watchCounts.set(key, (this.watchCounts.get(key) ?? 0) + 1)
    let unwatched = false
    return {
      ref: handle.ref,
      setInterval: handle.setInterval,
      snapshot: handle.snapshot,
      unwatch: () => {
        if (unwatched) return
        unwatched = true
        handle.unwatch()
        const left = (this.watchCounts.get(key) ?? 1) - 1
        if (left > 0) this.watchCounts.set(key, left)
        else {
          this.watchCounts.delete(key)
          this.setProblem(key, null) // nobody shows the port any more
        }
      },
    }
  }

  problemOf(key: string): string | undefined {
    return this.problems.get(key)
  }

  subscribeProblem(key: string, listener: Listener): () => void {
    let set = this.problemListeners.get(key)
    if (!set) this.problemListeners.set(key, (set = new Set()))
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.problemListeners.delete(key)
    }
  }

  private setProblem(key: string, problem: string | null): void {
    if ((this.problems.get(key) ?? null) === problem) return
    if (problem === null) this.problems.delete(key)
    else this.problems.set(key, problem)
    this.problemListeners.get(key)?.forEach(listener => listener())
  }

  private clearProblems(): void {
    const keys = Array.from(this.problems.keys())
    this.problems.clear()
    for (const key of keys) this.problemListeners.get(key)?.forEach(listener => listener())
  }
}

// --- React bindings --------------------------------------------------------------------

const InspectorContext = createContext<EditorInspector | null>(null)

export const useInspector = () => useContext(InspectorContext)

export function InspectorProvider({
  engineGatewayUrl,
  graphName,
  children,
}: {
  engineGatewayUrl: string | undefined
  graphName: string | undefined
  children: ReactNode
}) {
  const [inspector, setInspector] = useState<EditorInspector | null>(null)
  const engine = useEngineCapabilitiesFor(engineGatewayUrl)
  useEffect(() => {
    if (!engineGatewayUrl || !graphName) return
    const instance = new EditorInspector(engineGatewayUrl, graphName)
    setInspector(instance)
    return () => {
      instance.dispose()
      setInspector(null)
    }
  }, [engineGatewayUrl, graphName])
  useEffect(() => {
    if (!inspector || engine.status === "loading") return
    inspector.applyCapabilities(engine.status === "ok" ? engine.capabilities : null)
  }, [inspector, engine.status, engine.capabilities])
  return <InspectorContext.Provider value={inspector}>{children}</InspectorContext.Provider>
}

const NO_STATE: InspectorUiState = {
  supported: undefined,
  enabled: false,
  status: { state: "idle", reasons: [] },
}
const noopSubscribe = () => () => {}

export function useInspectorState(): InspectorUiState {
  const inspector = useInspector()
  return useSyncExternalStore(
    inspector ? inspector.subscribeState : noopSubscribe,
    inspector ? inspector.getState : () => NO_STATE,
    () => NO_STATE,
  )
}

/** One fact of the inspector's state; re-renders only when that fact changes (not on every status). */
function useInspectorFact(fact: (state: InspectorUiState) => boolean): boolean {
  const inspector = useInspector()
  return useSyncExternalStore(
    inspector ? inspector.subscribeState : noopSubscribe,
    () => (inspector ? fact(inspector.getState()) : false),
    () => false,
  )
}

const isLive = (state: InspectorUiState) => Boolean(state.supported && state.enabled)
const isObserving = (state: InspectorUiState) =>
  isLive(state) && (state.status.state === "ok" || state.status.state === "throttled")

/** The inspector decorates ports: the engine has one and it is turned on. */
export function useInspectorLive(): boolean {
  return useInspectorFact(isLive)
}

/**
 * The engine is observing ports now: activity tells what flows. Not while
 * connecting, paused (the engine lags) or hidden (a background tab), when
 * every port only looks stopped.
 */
export function useInspectorObserving(): boolean {
  return useInspectorFact(isObserving)
}

/** Values flow through the port now (the engine decides when a port stopped). */
export function isFlowing(entry: ActivityEntry | undefined): boolean {
  return entry !== undefined && entry.hz > 0
}

/**
 * The activity port behind an edge's source handle: an engine node's output
 * or the graph's own input / output port (node ""). null for editor nodes.
 */
export function sourceActivityRef(source: string, sourceHandle: string | null | undefined): InspectorPortRef | null {
  if (source.startsWith("$input:")) return { node: "", dir: "in", port: source.slice("$input:".length) }
  if (source.startsWith("$output:")) return { node: "", dir: "out", port: source.slice("$output:".length) }
  if (source.startsWith("$") || !sourceHandle) return null
  return { node: source, dir: "out", port: sourceHandle }
}

/**
 * Why a watched port shows nothing (too large to show, gone, refused), or
 * undefined. Re-renders only when that port's problem changes.
 */
export function usePortProblem(ref: InspectorPortRef | null): string | undefined {
  const inspector = useInspector()
  const key = ref ? portKey(ref) : ""
  const subscribe = useCallback(
    (listener: Listener) => (inspector && key ? inspector.subscribeProblem(key, listener) : () => {}),
    [inspector, key],
  )
  return useSyncExternalStore(
    subscribe,
    () => (inspector && key ? inspector.problemOf(key) : undefined),
    () => undefined,
  )
}

/**
 * Live activity of one port (re-renders only when that port's entry
 * changes). Pass null to skip (e.g. for ports that are not shown).
 */
export function usePortActivity(ref: InspectorPortRef | null): ActivityEntry | undefined {
  const inspector = useInspector()
  const subscribe = usePortSubscription(inspector, ref)
  const key = ref ? portKey(ref) : ""
  const version = useSyncExternalStore(
    subscribe,
    () => (inspector && key ? inspector.portVersion(key) : 0),
    () => 0,
  )
  void version // the entry object is reused; the version tells React it changed
  return inspector && ref ? inspector.activityOf(ref) : undefined
}

/**
 * Whether values flow through one port (re-renders only when it starts or
 * stops, not on every activity row). Pass null to skip.
 */
export function usePortFlowing(ref: InspectorPortRef | null): boolean {
  const inspector = useInspector()
  const subscribe = usePortSubscription(inspector, ref)
  return useSyncExternalStore(
    subscribe,
    () => (inspector && ref ? isFlowing(inspector.activityOf(ref)) : false),
    () => false,
  )
}

/**
 * The port's rate as shown ("15", "1.0"), "" while it does not flow. Re-renders
 * only when that text changes, not on every activity row. Pass null to skip
 * (e.g. while the rate is not shown).
 */
export function usePortRateText(ref: InspectorPortRef | null): string {
  const inspector = useInspector()
  const subscribe = usePortSubscription(inspector, ref)
  return useSyncExternalStore(
    subscribe,
    () => {
      const entry = inspector && ref ? inspector.activityOf(ref) : undefined
      return entry && isFlowing(entry) ? formatHz(entry.hz) : ""
    },
    () => "",
  )
}

/** Registers the port for activity while mounted; returns the subscribe function for its entry. */
function usePortSubscription(inspector: EditorInspector | null, ref: InspectorPortRef | null) {
  const node = ref?.node
  const dir = ref?.dir
  const port = ref?.port
  const key = ref ? portKey(ref) : ""

  useEffect(() => {
    if (!inspector || node === undefined || dir === undefined || port === undefined) return
    return inspector.registerPort({ node, dir, port })
  }, [inspector, node, dir, port])

  return useCallback(
    (listener: Listener) => (inspector && key ? inspector.subscribePort(key, listener) : () => {}),
    [inspector, key],
  )
}
