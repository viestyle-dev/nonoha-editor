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
  fetchEngineCapabilities,
  InspectorClient,
  InspectorPortRef,
  InspectorStatus,
  ValueKind,
  WatchCallbacks,
  WatchHandle,
  WatchOptions,
} from "nonoha-client-js"

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
  /** undefined while capabilities load; false for engines without an inspector. */
  supported: boolean | undefined
  enabled: boolean
  status: InspectorStatus
  engineVersion: string | undefined
  /** Capabilities endpoint: "none" for engines before 1.1 (404). */
  capabilities: "loading" | "none" | "error" | "ok"
  /** Plugin static files (views) are served by the engine. */
  pluginStatic: boolean
  /** The engine accepts environment values (API keys) from the editor. */
  envSettings: boolean
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

  constructor(engineGatewayUrl: string, graphName: string) {
    this.engineGatewayUrl = engineGatewayUrl
    this.graphName = graphName
    this.state = {
      supported: undefined,
      enabled: readInspectorDefault(),
      status: { state: "idle", reasons: [] },
      engineVersion: undefined,
      capabilities: "loading",
      pluginStatic: false,
      envSettings: false,
    }
  }

  start(): void {
    fetchEngineCapabilities(this.engineGatewayUrl)
      .then(capabilities => {
        if (this.disposed) return
        this.capabilities = capabilities
        this.setState({
          supported: Boolean(capabilities?.inspector?.enabled),
          engineVersion: capabilities?.engine,
          capabilities: capabilities ? "ok" : "none",
          pluginStatic: Boolean(capabilities?.plugin_static),
          envSettings: Boolean(capabilities?.env_settings),
        })
        if (this.state.enabled) this.connect()
      })
      .catch(() => {
        if (!this.disposed) this.setState({ supported: false, capabilities: "error" })
      })
  }

  dispose(): void {
    this.disposed = true
    if (this.flushTimer !== null) clearTimeout(this.flushTimer)
    this.client?.close()
    this.client = null
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
      this.setState({ status: { state: "idle", reasons: [] } })
    }
  }

  resume(): void {
    this.client?.resume()
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

  /** Take one of the MAX_PREVIEWS slots; false when all are in use. */
  acquirePreviewSlot(): boolean {
    if (this.previewSlots >= MAX_PREVIEW_SLOTS) return false
    this.previewSlots++
    return true
  }

  releasePreviewSlot(): void {
    if (this.previewSlots > 0) this.previewSlots--
    this.slotListeners.forEach(listener => listener())
  }

  onPreviewSlotFreed(listener: Listener): () => void {
    this.slotListeners.add(listener)
    return () => this.slotListeners.delete(listener)
  }

  // --- watches ---------------------------------------------------------------------

  /** Watch a port; null while the inspector is off or unsupported. */
  watch(ref: InspectorPortRef, options: WatchOptions, callbacks: WatchCallbacks): WatchHandle | null {
    return this.client?.watch(ref, options, callbacks) ?? null
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
  useEffect(() => {
    if (!engineGatewayUrl || !graphName) return
    const instance = new EditorInspector(engineGatewayUrl, graphName)
    instance.start()
    setInspector(instance)
    return () => {
      instance.dispose()
      setInspector(null)
    }
  }, [engineGatewayUrl, graphName])
  return <InspectorContext.Provider value={inspector}>{children}</InspectorContext.Provider>
}

const NO_STATE: InspectorUiState = {
  supported: undefined,
  enabled: false,
  status: { state: "idle", reasons: [] },
  engineVersion: undefined,
  capabilities: "loading",
  pluginStatic: false,
  envSettings: false,
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

/**
 * Live activity of one port (re-renders only when that port's entry
 * changes). Pass null to skip (e.g. for ports that are not shown).
 */
export function usePortActivity(ref: InspectorPortRef | null): ActivityEntry | undefined {
  const inspector = useInspector()
  const node = ref?.node
  const dir = ref?.dir
  const port = ref?.port
  const key = ref ? portKey(ref) : ""

  useEffect(() => {
    if (!inspector || node === undefined || dir === undefined || port === undefined) return
    return inspector.registerPort({ node, dir, port })
  }, [inspector, node, dir, port])

  const subscribe = useCallback(
    (listener: Listener) => (inspector && key ? inspector.subscribePort(key, listener) : () => {}),
    [inspector, key],
  )
  const version = useSyncExternalStore(
    subscribe,
    () => (inspector && key ? inspector.portVersion(key) : 0),
    () => 0,
  )
  void version // the entry object is reused; the version tells React it changed
  return inspector && ref ? inspector.activityOf(ref) : undefined
}
