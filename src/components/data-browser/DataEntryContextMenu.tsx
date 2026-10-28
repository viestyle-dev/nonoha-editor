import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
} from "@mui/material"
import DownloadIcon from "@mui/icons-material/Download"
import DeleteIcon from "@mui/icons-material/Delete"
import { memo } from "react"
import type { DataEntry } from "./types"

export interface DataEntryContextMenuProps {
  anchorPosition: { top: number; left: number } | null
  entry: DataEntry | null
  onClose: () => void
  onDownload: (entry: DataEntry) => void
  onDelete: (entry: DataEntry) => void
}

export const DataEntryContextMenu = memo(
  (props: DataEntryContextMenuProps) => {
    const { anchorPosition, entry, onClose, onDownload, onDelete } = props

    return (
      <Popover
        open={!!anchorPosition && !!entry}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={anchorPosition ?? undefined}
      >
        {entry && (
          <List dense disablePadding sx={{ minWidth: 160 }}>
            {entry.type === "file" && (
              <ListItemButton
                onClick={() => {
                  onDownload(entry)
                  onClose()
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <DownloadIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Download" />
              </ListItemButton>
            )}
            <ListItemButton
              onClick={() => {
                onDelete(entry)
                onClose()
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <DeleteIcon fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText
                primary="Delete"
                primaryTypographyProps={{ color: "error" }}
              />
            </ListItemButton>
          </List>
        )}
      </Popover>
    )
  },
)
