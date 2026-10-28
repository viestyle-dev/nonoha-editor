import type { FileCategory } from "@/src/components/data-browser/types"

export const MAX_PREVIEW_SIZE = 10_485_760 // 10 MB

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".log",
  ".md",
  ".xml",
  ".yaml",
  ".yml",
  ".py",
  ".js",
  ".ts",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".sh",
  ".bat",
])

export function getFileCategory(filename: string): FileCategory {
  const dot = filename.lastIndexOf(".")
  if (dot < 0) return "binary"
  const ext = filename.slice(dot).toLowerCase()
  if (ext === ".csv") return "csv"
  if (ext === ".json") return "json"
  if (TEXT_EXTENSIONS.has(ext)) return "text"
  return "binary"
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toLocaleString()
}
