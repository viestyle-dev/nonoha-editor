import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material"
import { memo } from "react"
import type { DataEntry } from "./types"

export interface DeleteConfirmDialogProps {
  open: boolean
  entry: DataEntry | null
  itemCount?: number
  onConfirm: () => void
  onCancel: () => void
}

export const DeleteConfirmDialog = memo((props: DeleteConfirmDialogProps) => {
  const { open, entry, itemCount, onConfirm, onCancel } = props
  if (!entry) return null

  const isDir = entry.type === "directory"

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Delete &quot;{entry.name}&quot;?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {isDir && itemCount != null
            ? `This folder contains ${itemCount} item${itemCount !== 1 ? "s" : ""} and cannot be recovered.`
            : "This action cannot be undone."}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  )
})
