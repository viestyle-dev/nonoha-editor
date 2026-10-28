// API response types (canonical source: nonoha-client-js)
export type {
  DataEntry,
  DataDirectoryResponse,
  DataFileResponse,
} from "nonoha-client-js"

// Editor-only UI types
export type SortField = "name" | "modified" | "size"
export type SortDirection = "asc" | "desc"
export type FileCategory = "text" | "csv" | "json" | "binary"

export interface PreviewContent {
  text: string
  blob: Blob
}
