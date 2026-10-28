import { Close } from "@mui/icons-material"
import { Button, IconButton } from "@mui/material"
import { closeSnackbar, SnackbarKey } from "notistack"
import { css } from "@emotion/react"

export const SnackbarActionClose = (snackbarId: SnackbarKey) => {
  return (
    <IconButton
      // size="small"
      aria-label="close"
      color="inherit"
      onClick={() => {
        closeSnackbar(snackbarId)
      }}
    >
      <Close />
    </IconButton>
  )
}

export const SnackbarActionPromptReload = (snackbarId: SnackbarKey) => {
  return (
    <>
      <Button
        css={css({
          color: "inherit",
        })}
        onClick={() => {
          window.location.reload()

          closeSnackbar(snackbarId)
        }}
      >
        Reload
      </Button>
      <IconButton
        aria-label="close"
        color="inherit"
        onClick={() => {
          closeSnackbar(snackbarId)
        }}
      >
        <Close />
      </IconButton>
    </>
  )
}
