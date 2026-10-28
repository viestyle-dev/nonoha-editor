import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react"

export interface CatalogPortInfo {
  name: string
  description: string
  types: string[]
  value_names?: (string | null)[]
}

export interface CatalogPropertyInfo {
  default: unknown
  description: string
}

export interface CatalogEntry {
  type: string
  description: string
  category: string
  inputs: CatalogPortInfo[]
  outputs: CatalogPortInfo[]
  properties: Record<string, CatalogPropertyInfo>
}

interface NodeCatalogState {
  entries: Map<string, CatalogEntry>
  loaded: boolean
}

const defaultState: NodeCatalogState = {
  entries: new Map(),
  loaded: false,
}

type Action = {
  type: "setEntries"
  payload: CatalogEntry[]
}

const NodeCatalogStateContext = createContext<NodeCatalogState>(defaultState)

const reducer = (state: NodeCatalogState, action: Action): NodeCatalogState => {
  switch (action.type) {
    case "setEntries": {
      const map = new Map<string, CatalogEntry>()
      for (const entry of action.payload) {
        map.set(entry.type, entry)
      }
      return { entries: map, loaded: true }
    }
  }
}

export const useNodeCatalog = () => useContext(NodeCatalogStateContext)

export const NodeCatalogProvider = ({
  engineGatewayUrl,
  children,
}: {
  engineGatewayUrl: string | undefined
  children: ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, defaultState)

  useEffect(() => {
    if (!engineGatewayUrl) return

    fetch(`http://${engineGatewayUrl}/node-flow/catalog/nodes`)
      .then(response => response.json())
      .then((entries: CatalogEntry[]) => {
        dispatch({ type: "setEntries", payload: entries })
      })
      .catch(error => {
        console.error("Error fetching node catalog", error)
      })
  }, [engineGatewayUrl])

  return (
    <NodeCatalogStateContext.Provider value={state}>
      {children}
    </NodeCatalogStateContext.Provider>
  )
}
