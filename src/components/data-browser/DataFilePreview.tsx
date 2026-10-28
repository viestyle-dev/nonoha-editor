import {
  Button,
  CircularProgress,
  Divider,
  Table,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  IconButton,
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import DownloadIcon from "@mui/icons-material/Download"
import RefreshIcon from "@mui/icons-material/Refresh"
import SaveIcon from "@mui/icons-material/Save"
import VisibilityIcon from "@mui/icons-material/Visibility"
import { memo, useMemo, useRef } from "react"
import { css } from "@emotion/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useThemeStore } from "@/src/stores/theme-store"
import type { MaterialColors } from "@/src/stores/theme-store"
import {
  formatFileSize,
  formatTimestamp,
  getFileCategory,
  MAX_PREVIEW_SIZE,
} from "@/src/api/data-api"
import type {
  DataFileResponse,
  PreviewContent,
} from "@/src/components/data-browser/types"

export interface DataFilePreviewProps {
  file: DataFileResponse
  previewContent: PreviewContent | null
  loading: boolean
  onBack: () => void
  onDownload: () => void
  onPreview: () => void
  onRefresh: () => void
  scrollContainerRef?: React.RefObject<HTMLDivElement>
}

function saveToLocal(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ",") {
        fields.push(current.trim())
        current = ""
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

function parseCsvPreview(text: string): {
  headers: string[]
  rows: string[][]
} {
  const lines = text.split("\n").filter(l => l.trim() !== "")
  const rows = lines.map(l => splitCsvLine(l))
  const colCount = Math.max(...rows.map(r => r.length), 0)
  const headers = Array.from({ length: colCount }, (_, i) => `col${i + 1}`)
  return { headers, rows }
}

function isBinaryContent(text: string): boolean {
  return text.includes("\x00")
}

// --- Virtualized sub-components ---

const LINE_HEIGHT = 18 // 12px font * 1.5 line-height
const CSV_ROW_HEIGHT = 28

const textContainerCss = (colors: MaterialColors) =>
  css({
    overflow: "auto",
    maxHeight: "calc(100vh - 280px)",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 8,
    border: `1px solid ${colors.outlineVariant}`,
  })

const textRowCss = css({
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: LINE_HEIGHT,
  display: "flex",
  fontFamily: "monospace",
  fontSize: 12,
  lineHeight: `${LINE_HEIGHT}px`,
  padding: "0 12px",
  whiteSpace: "pre",
  boxSizing: "border-box",
})

const lineNumberCss = (colors: MaterialColors) =>
  css({
    color: colors.onSurfaceVariant,
    opacity: 0.5,
    minWidth: 48,
    textAlign: "right" as const,
    marginRight: 12,
    flexShrink: 0,
    userSelect: "none" as const,
  })

interface VirtualizedTextPreviewProps {
  lines: string[]
  colors: MaterialColors
  scrollRef: React.RefObject<HTMLDivElement>
}

const VirtualizedTextPreview = memo(
  ({ lines, colors, scrollRef }: VirtualizedTextPreviewProps) => {
    const virtualizer = useVirtualizer({
      count: lines.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => LINE_HEIGHT,
      overscan: 20,
    })

    return (
      <div ref={scrollRef} css={textContainerCss(colors)}>
        <div
          css={css({
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          })}
        >
          {virtualizer.getVirtualItems().map(virtualRow => (
            <div
              key={virtualRow.index}
              css={textRowCss}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <span css={lineNumberCss(colors)}>{virtualRow.index + 1}</span>
              <span css={css({ color: colors.onSurface })}>
                {lines[virtualRow.index]}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  },
)

interface VirtualizedCsvPreviewProps {
  headers: string[]
  rows: string[][]
  colors: MaterialColors
  scrollRef: React.RefObject<HTMLDivElement>
}

const VirtualizedCsvPreview = memo(
  ({ headers, rows, colors, scrollRef }: VirtualizedCsvPreviewProps) => {
    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => CSV_ROW_HEIGHT,
      overscan: 15,
    })

    const colWidth = `${100 / headers.length}%`

    const cellCss = css({
      padding: "4px 8px",
      fontSize: 12,
      whiteSpace: "nowrap" as const,
      overflow: "hidden",
      textOverflow: "ellipsis",
      boxSizing: "border-box",
      borderBottom: `1px solid ${colors.outlineVariant}`,
      color: colors.onSurface,
    })

    return (
      <div>
        {/* Fixed header */}
        <Table size="small">
          <TableHead>
            <TableRow>
              {headers.map((h, i) => (
                <TableCell
                  key={i}
                  sx={{
                    color: colors.onSurface,
                    borderColor: colors.outlineVariant,
                    padding: "4px 8px",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    backgroundColor: colors.surfaceContainer,
                    width: colWidth,
                  }}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
        </Table>

        {/* Virtualized body */}
        <div
          ref={scrollRef}
          css={css({
            overflow: "auto",
            maxHeight: "calc(100vh - 330px)",
          })}
        >
          <div
            css={css({
              height: virtualizer.getTotalSize(),
              position: "relative",
            })}
          >
            {virtualizer.getVirtualItems().map(virtualRow => (
              <div
                key={virtualRow.index}
                css={css({
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: CSV_ROW_HEIGHT,
                  display: "flex",
                })}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {rows[virtualRow.index].map((cell, ci) => (
                  <div
                    key={ci}
                    css={cellCss}
                    style={{ width: colWidth, flexShrink: 0 }}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Row count */}
        <Typography
          variant="caption"
          css={css({
            display: "block",
            textAlign: "center",
            padding: 8,
            color: colors.onSurfaceVariant,
          })}
        >
          {rows.length.toLocaleString()} rows
        </Typography>
      </div>
    )
  },
)

// --- Main component ---

export const DataFilePreview = memo((props: DataFilePreviewProps) => {
  const {
    file,
    previewContent,
    loading,
    onBack,
    onDownload,
    onPreview,
    onRefresh,
    scrollContainerRef,
  } = props
  const [{ colors }] = useThemeStore()
  const localScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? localScrollRef
  const canPreview = file.size <= MAX_PREVIEW_SIZE
  const category = getFileCategory(file.name)

  const isBinary = useMemo(() => {
    if (!previewContent) return false
    return isBinaryContent(previewContent.text)
  }, [previewContent])

  const csvData = useMemo(() => {
    if (category !== "csv" || !previewContent || isBinary) return null
    return parseCsvPreview(previewContent.text)
  }, [category, previewContent, isBinary])

  const textLines = useMemo(() => {
    if (!previewContent || category === "csv" || isBinary) return null
    return previewContent.text.split("\n")
  }, [previewContent, category, isBinary])

  // For binary-categorized files without NUL bytes, show as text
  const fallbackLines = useMemo(() => {
    if (!previewContent || isBinary || csvData || textLines) return null
    return previewContent.text.split("\n")
  }, [previewContent, isBinary, csvData, textLines])

  const linesToRender = textLines ?? fallbackLines

  return (
    <div
      css={css({
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      })}
    >
      {/* Header */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 8px 8px 4px",
          flexShrink: 0,
        })}
      >
        <IconButton size="small" onClick={onBack}>
          <ArrowBackIcon css={css({ fontSize: 20, color: colors.onSurface })} />
        </IconButton>
        <Typography
          css={css({
            fontSize: 14,
            fontWeight: 500,
            color: colors.onSurface,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexGrow: 1,
          })}
        >
          {file.name}
        </Typography>
      </div>

      {/* Metadata */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px 8px",
          flexShrink: 0,
        })}
      >
        <Typography
          variant="caption"
          css={css({ color: colors.onSurfaceVariant })}
        >
          {formatFileSize(file.size)}
        </Typography>
        <Typography
          variant="caption"
          css={css({ color: colors.onSurfaceVariant })}
        >
          {formatTimestamp(file.modified)}
        </Typography>
      </div>

      {/* Primary actions: Download + Preview */}
      <div
        css={css({
          display: "flex",
          gap: 8,
          padding: "0 16px 8px",
          flexShrink: 0,
        })}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={onDownload}
        >
          Download
        </Button>
        {canPreview && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityIcon />}
            onClick={onPreview}
            disabled={loading}
          >
            Preview
          </Button>
        )}
      </div>

      <Divider />

      {/* Preview area */}
      <div
        css={css({
          flexGrow: 1,
          overflow: "auto",
          minHeight: 0,
          padding: 8,
        })}
      >
        {/* Loading */}
        {loading && (
          <div
            css={css({
              display: "flex",
              justifyContent: "center",
              padding: 32,
            })}
          >
            <CircularProgress size={32} />
          </div>
        )}

        {/* No preview loaded yet */}
        {!loading && !previewContent && canPreview && (
          <div
            css={css({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
              gap: 8,
              color: colors.onSurfaceVariant,
            })}
          >
            <Typography variant="body2">
              Click Preview to load file content
            </Typography>
          </div>
        )}

        {/* File too large */}
        {!loading && !canPreview && (
          <div
            css={css({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
              gap: 8,
              color: colors.onSurfaceVariant,
            })}
          >
            <Typography variant="body2">
              File too large to preview
            </Typography>
            <Typography variant="caption">
              {formatFileSize(file.size)}
            </Typography>
          </div>
        )}

        {/* Binary detected */}
        {!loading && previewContent && isBinary && (
          <div
            css={css({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 48,
              gap: 8,
              color: colors.onSurfaceVariant,
            })}
          >
            <Typography variant="body2">Binary file detected</Typography>
          </div>
        )}

        {/* Preview content loaded */}
        {!loading && previewContent && !isBinary && (
          <div>
            {/* Preview-area actions */}
            <div
              css={css({
                display: "flex",
                gap: 8,
                paddingBottom: 8,
              })}
            >
              <Button
                size="small"
                variant="text"
                startIcon={<RefreshIcon />}
                onClick={onRefresh}
              >
                Refresh
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<SaveIcon />}
                onClick={() => saveToLocal(previewContent.blob, file.name)}
              >
                Save to Local
              </Button>
            </div>

            {/* CSV - virtualized */}
            {csvData && (
              <VirtualizedCsvPreview
                headers={csvData.headers}
                rows={csvData.rows}
                colors={colors}
                scrollRef={scrollRef}
              />
            )}

            {/* Text / JSON / fallback - virtualized */}
            {linesToRender && (
              <VirtualizedTextPreview
                lines={linesToRender}
                colors={colors}
                scrollRef={scrollRef}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
})
