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
  }
  type: string
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
