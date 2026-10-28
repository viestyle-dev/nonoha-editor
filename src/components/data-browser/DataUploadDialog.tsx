import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material"
import { memo } from "react"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"

export interface UploadConflict {
  file: File
  exists: boolean
}

export interface UploadProgress {
  currentFile: string
  fileIndex: number
  fileCount: number
  loaded: number
  total: number
}

export interface DataUploadDialogProps {
  open: boolean
  conflicts: UploadConflict[]
  progress: UploadProgress | null
  onConfirmOverwrite: () => void
  onCancel: () => void
}

export const DataUploadDialog = memo((props: DataUploadDialogProps) => {
  const { open, conflicts, progress, onConfirmOverwrite, onCancel } = props
  const [{ colors }] = useThemeStore()

  const conflicting = conflicts.filter((c) => c.exists)
  const isUploading = progress !== null

  if (isUploading) {
    const pct =
      progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0

    return (
      <Dialog open={open} maxWidth="xs" fullWidth>
        <DialogTitle>Uploading...</DialogTitle>
        <DialogContent>
          <Typography variant="body2" css={css({ marginBottom: 8 })}>
            {progress.currentFile} ({progress.fileIndex + 1} of{" "}
            {progress.fileCount})
          </Typography>
          <LinearProgress variant="determinate" value={pct} />
          <Typography
            variant="caption"
            css={css({ marginTop: 4, color: colors.onSurfaceVariant })}
          >
            {Math.round(pct)}%
          </Typography>
        </DialogContent>
      </Dialog>
    )
  }

  if (conflicting.length === 0) return null

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Files already exist</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {conflicting.length} file{conflicting.length !== 1 ? "s" : ""} already
          exist in this directory:
        </DialogContentText>
        <List dense>
          {conflicting.map((c) => (
            <ListItem key={c.file.name} disablePadding>
              <ListItemText primary={c.file.name} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirmOverwrite} variant="contained">
          Overwrite
        </Button>
      </DialogActions>
    </Dialog>
  )
})
