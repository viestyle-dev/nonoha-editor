import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextareaAutosize,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import { memo, useEffect, useState } from "react"
import { css } from "@emotion/react"
import { OpenInNew } from "@mui/icons-material"

type PopupTextFieldProps = {
  value: string
  onChange: (value: string) => void
  dialogTitle?: string
}

export const PopupTextField = (props: PopupTextFieldProps) => {
  const { value, onChange, dialogTitle = "Editing" } = props

  const [focused, setFocused] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingText, setEditingText] = useState(value)

  const handleOpenDialog = () => {
    setEditingText(value) // ダイアログを開く時に現在の値を設定
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
  }

  const handleApply = () => {
    onChange(editingText)
    handleCloseDialog()
  }

  return (
    <>
      <div css={css({ display: "flex", alignItems: "center", width: "100%" })}>
        <TextField
          value={value}
          variant="standard"
          size="small"
          fullWidth
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          slotProps={{
            input: {
              style: {
                fontSize: "0.875rem",
              },
            },
            htmlInput: {
              style: {
                paddingBottom: 1,
              },
            },
          }}
          autoComplete="off"
        />
        {focused && (
          <IconButton
            size="small"
            onClick={handleOpenDialog}
            css={css({
              position: "absolute",
              right: "-24px",
            })}
          >
            <OpenInNew fontSize="small" />
          </IconButton>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth={false}
        PaperProps={{
          sx: {
            width: "500px",
            height: "400px",
            minWidth: "300px",
            minHeight: "200px",
            resize: "both",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, flexShrink: 0 }}>{dialogTitle}</DialogTitle>
        <DialogContent sx={{ p: 2, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <textarea
            value={editingText}
            onChange={e => setEditingText(e.target.value)}
            style={{
              flex: 1,
              padding: "8px",
              fontFamily: "monospace",
              fontSize: "0.875rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
              resize: "none",
              whiteSpace: "pre",
              overflowX: "auto",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          />
        </DialogContent>
        <DialogActions sx={{ flexShrink: 0 }}>
          <Button onClick={handleCloseDialog} size="small">
            Cancel
          </Button>
          <Button onClick={handleApply} size="small" variant="contained">
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
type NodePropertyInputFieldProps = {
  name: string
  description?: string
  valueObject: { value: string | number | boolean }
  onChange: (value: string | number | boolean) => void
}

export const NodePropertyInputField = memo(
  (props: NodePropertyInputFieldProps) => {
    const { name } = props
    const [value, setValue] = useState(props.valueObject.value)
    useEffect(() => {
      // console.log("props.value", props.value)
      setValue(props.valueObject.value)
    }, [props.valueObject])

    const valueType = typeof value

    return (
      <div
        css={{ display: "flex", flexDirection: "row", alignItems: "center", minWidth: 0 }}
      >
        <Tooltip title={props.description ? <>{name}<br />{props.description}</> : name} placement="left">
          <Typography
            variant="caption"
            sx={{
              pr: 1,
              flexShrink: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "60px",
            }}
          >
            {name}
          </Typography>
        </Tooltip>
        {valueType === "boolean" ? (
          <Checkbox
            checked={value as boolean}
            onChange={e => {
              props.onChange(e.target.checked)
              setValue(e.target.checked)
            }}
            size="small"
            css={{
              padding: 1,
            }}
          />
        ) : (
          <div
            key={name}
            css={css({
              flexGrow: 1,
              minWidth: 0,
            })}
          >
            <PopupTextField
              value={value as string}
              onChange={value => {
                props.onChange(value)
                setValue(value)
              }}
            />
          </div>
        )}
      </div>
    )
  }
)
