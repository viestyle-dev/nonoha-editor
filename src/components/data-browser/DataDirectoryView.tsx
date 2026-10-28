import {
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Skeleton,
  Typography,
} from "@mui/material"
import FolderIcon from "@mui/icons-material/Folder"
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile"
import FolderOffIcon from "@mui/icons-material/FolderOff"
import RefreshIcon from "@mui/icons-material/Refresh"
import FileUploadIcon from "@mui/icons-material/FileUpload"
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder"
import MoreVertIcon from "@mui/icons-material/MoreVert"
import { memo, useCallback, useMemo, useState } from "react"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"
import { formatFileSize, formatTimestamp } from "@/src/api/data-api"
import type {
  DataEntry,
  SortField,
  SortDirection,
} from "@/src/components/data-browser/types"
import { DataEntryContextMenu } from "./DataEntryContextMenu"

export interface DataDirectoryViewProps {
  entries: DataEntry[]
  sortField: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField) => void
  onDirectoryClick: (name: string) => void
  onFileClick: (name: string) => void
  onRefresh: () => void
  onUploadClick: () => void
  onNewFolderClick: () => void
  onDownload: (entry: DataEntry) => void
  onDelete: (entry: DataEntry) => void
  loading: boolean
}

export const DataDirectoryView = memo((props: DataDirectoryViewProps) => {
  const {
    entries,
    sortField,
    sortDirection,
    onSortChange,
    onDirectoryClick,
    onFileClick,
    onRefresh,
    onUploadClick,
    onNewFolderClick,
    onDownload,
    onDelete,
    loading,
  } = props
  const [{ colors }] = useThemeStore()
  const [menuAnchor, setMenuAnchor] = useState<{
    position: { top: number; left: number }
    entry: DataEntry
  } | null>(null)

  const handleMenuOpen = useCallback(
    (e: React.MouseEvent, entry: DataEntry) => {
      e.stopPropagation()
      setMenuAnchor({
        position: { top: e.clientY, left: e.clientX },
        entry,
      })
    },
    [],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: DataEntry) => {
      e.preventDefault()
      e.stopPropagation()
      setMenuAnchor({
        position: { top: e.clientY, left: e.clientX },
        entry,
      })
    },
    [],
  )

  const sortedEntries = useMemo(() => {
    const dirs = entries.filter(e => e.type === "directory")
    const files = entries.filter(e => e.type === "file")

    const compare = (a: DataEntry, b: DataEntry): number => {
      const dir = sortDirection === "asc" ? 1 : -1
      switch (sortField) {
        case "name":
          return a.name.localeCompare(b.name) * dir
        case "size":
          return ((a.size ?? 0) - (b.size ?? 0)) * dir
        case "modified":
          return ((a.modified ?? 0) - (b.modified ?? 0)) * dir
        default:
          return 0
      }
    }

    return [...dirs.sort(compare), ...files.sort(compare)]
  }, [entries, sortField, sortDirection])

  const cellSx = {
    color: colors.onSurface,
    borderColor: colors.outlineVariant,
    padding: "6px 12px",
    fontSize: 13,
  }

  return (
    <div>
      {/* Toolbar — always visible */}
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          padding: "4px 8px",
          gap: 4,
        })}
      >
        <Button
          size="small"
          startIcon={<FileUploadIcon css={css({ fontSize: 16 })} />}
          onClick={onUploadClick}
          css={css({ fontSize: 12, textTransform: "none" })}
        >
          Upload
        </Button>
        <Button
          size="small"
          startIcon={<CreateNewFolderIcon css={css({ fontSize: 16 })} />}
          onClick={onNewFolderClick}
          css={css({ fontSize: 12, textTransform: "none" })}
        >
          New Folder
        </Button>
        <div css={css({ flexGrow: 1 })} />
        <IconButton
          size="small"
          onClick={onRefresh}
          title="Refresh"
          disabled={loading}
        >
          <RefreshIcon
            css={css({ fontSize: 18, color: colors.onSurfaceVariant })}
          />
        </IconButton>
      </div>

      {loading ? (
        <div css={css({ padding: 16 })}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              height={36}
              css={css({ marginBottom: 4, borderRadius: 4 })}
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
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
          <FolderOffIcon css={css({ fontSize: 48, opacity: 0.5 })} />
          <Typography variant="body2">This directory is empty</Typography>
        </div>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...cellSx, width: 36, padding: "6px 8px" }} />
                <TableCell sx={cellSx}>
                  <TableSortLabel
                    active={sortField === "name"}
                    direction={sortField === "name" ? sortDirection : "asc"}
                    onClick={() => onSortChange("name")}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ ...cellSx, width: 90 }}>
                  <TableSortLabel
                    active={sortField === "size"}
                    direction={sortField === "size" ? sortDirection : "asc"}
                    onClick={() => onSortChange("size")}
                  >
                    Size
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ ...cellSx, width: 160 }}>
                  <TableSortLabel
                    active={sortField === "modified"}
                    direction={sortField === "modified" ? sortDirection : "asc"}
                    onClick={() => onSortChange("modified")}
                  >
                    Modified
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ ...cellSx, width: 36, padding: "6px 4px" }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedEntries.map(entry => (
                <TableRow
                  key={entry.name}
                  hover
                  onClick={() =>
                    entry.type === "directory"
                      ? onDirectoryClick(entry.name)
                      : onFileClick(entry.name)
                  }
                  onContextMenu={(e) => handleContextMenu(e, entry)}
                  css={css({
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: `${colors.primary}14`,
                    },
                  })}
                >
                  <TableCell sx={{ ...cellSx, width: 36, padding: "6px 8px" }}>
                    {entry.type === "directory" ? (
                      <FolderIcon
                        css={css({ fontSize: 18, color: colors.primary })}
                      />
                    ) : (
                      <InsertDriveFileIcon
                        css={css({
                          fontSize: 18,
                          color: colors.onSurfaceVariant,
                        })}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={cellSx}>{entry.name}</TableCell>
                  <TableCell
                    sx={{ ...cellSx, color: colors.onSurfaceVariant }}
                  >
                    {entry.type === "file" && entry.size != null
                      ? formatFileSize(entry.size)
                      : ""}
                  </TableCell>
                  <TableCell
                    sx={{ ...cellSx, color: colors.onSurfaceVariant }}
                  >
                    {entry.type === "file" && entry.modified != null
                      ? formatTimestamp(entry.modified)
                      : ""}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, width: 36, padding: "6px 4px" }}>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, entry)}
                      css={css({ padding: 2 })}
                    >
                      <MoreVertIcon
                        css={css({
                          fontSize: 16,
                          color: colors.onSurfaceVariant,
                        })}
                      />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <DataEntryContextMenu
        anchorPosition={menuAnchor?.position ?? null}
        entry={menuAnchor?.entry ?? null}
        onClose={() => setMenuAnchor(null)}
        onDownload={onDownload}
        onDelete={onDelete}
      />
    </div>
  )
})
