import type { GraphEndpoint, PortData, PortValue } from "nonoha-client-js"

type ValuesListener = (values: PortValue[]) => void

/**
 * Routes a graph's output messages to listeners by port name, with a single
 * callback on the GraphClient. Display nodes used to register one callback
 * each and compare port names on every message; with the hub a message
 * costs one map lookup. Listener lists are arrays (replaced on change) so a
 * message is delivered with an index loop and no allocation.
 */
class GraphOutputHub {
  private readonly listeners = new Map<string, ValuesListener[]>()
  private readonly onOutput = (output: PortData) => {
    const list = this.listeners.get(output.portName)
    if (!list) return
    for (let i = 0; i < list.length; ++i) list[i](output.values)
  }

  constructor(private readonly endpoint: GraphEndpoint) {}

  subscribe(portName: string, listener: ValuesListener): () => void {
    if (this.listeners.size === 0) this.endpoint.addOutputCallback(this.onOutput)
    this.listeners.set(portName, (this.listeners.get(portName) ?? []).concat(listener))
    return () => {
      const list = this.listeners.get(portName)
      if (!list) return
      const rest = list.filter(l => l !== listener)
      if (rest.length > 0) this.listeners.set(portName, rest)
      else this.listeners.delete(portName)
      if (this.listeners.size === 0) this.endpoint.removeOutputCallback(this.onOutput)
    }
  }
}

const hubs = new WeakMap<GraphEndpoint, GraphOutputHub>()

/** Listen to one output port of the graph; returns the unsubscribe function. */
export function subscribeGraphOutput(
  endpoint: GraphEndpoint,
  portName: string,
  listener: ValuesListener,
): () => void {
  let hub = hubs.get(endpoint)
  if (!hub) hubs.set(endpoint, (hub = new GraphOutputHub(endpoint)))
  return hub.subscribe(portName, listener)
}
