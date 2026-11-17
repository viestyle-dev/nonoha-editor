import type {
  CatalogEntry,
  CatalogPortInfo,
  CatalogPropertyInfo,
} from "@/src/stores/node-catalog-store"

export type { CatalogEntry, CatalogPortInfo, CatalogPropertyInfo }

export interface NodePrototype {
  id: string
  data: {
    label: string
    /** Initial editor data saved with the node (settings.json data). */
    nodeData?: Record<string, unknown>
  }
  type: string
  /** Menu entry for prototypes that share a node type (e.g. one per view). */
  catalog?: {
    key: string
    label: string
    category: string
    description: string
    inputs: CatalogPortInfo[]
  }
  style?: {
    width?: number
    height?: number
  }
}

export type NodeSource = "engine" | "editor" | "port"

export interface UnifiedNodeEntry {
  key: string
  label: string
  category: string
  description: string
  inputCount: number
  outputCount: number
  source: NodeSource
  catalogEntry?: CatalogEntry
  prototype?: NodePrototype
  portType?: "input" | "output"
}
