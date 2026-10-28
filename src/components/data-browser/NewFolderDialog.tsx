import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material"
import { memo, useCallback, useState } from "react"

export interface NewFolderDialogProps {
  open: boolean
  onConfirm: (name: string) => void
  onCancel: () => void
}

const INVALID_CHARS = /[/\\]/
const INVALID_NAMES = new Set([".", ".."])

export const NewFolderDialog = memo((props: NewFolderDialogProps) => {
  const { open, onConfirm, onCancel } = props
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  const validate = useCallback((value: string): string => {
    if (!value.trim()) return "Name is required"
    if (INVALID_CHARS.test(value)) return "Name cannot contain / or \\"
    if (INVALID_NAMES.has(value.trim())) return "Invalid name"
    return ""
  }, [])

  const handleSubmit = useCallback(() => {
    const err = validate(name)
    if (err) {
      setError(err)
      return
    }
    onConfirm(name.trim())
    setName("")
    setError("")
  }, [name, validate, onConfirm])

  const handleClose = useCallback(() => {
    setName("")
    setError("")
    onCancel()
  }, [onCancel])

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Folder</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Folder name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError("")
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit()
          }}
          error={!!error}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained">
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
})
