import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material"
import { useEffect, useState } from "react"
import { useEngineGatewayStateStore } from "../stores/engine-gateway-store"
import { enqueueSnackbar } from "notistack"
import { css } from "@emotion/react"

export type EngineGatewaySettingsDialogProps = {
  open: boolean
  onClose: () => void
}

export const EngineGatewaySettingsDialog = (
  props: EngineGatewaySettingsDialogProps
) => {
  const [engineGatewayState, engineGatewayStateActions] =
    useEngineGatewayStateStore()
  const [engineGatewayUrl, setEngineGatewayUrl] = useState(
    engineGatewayState.engineGatewayUrl ?? "127.0.0.1:8000"
  )

  // Sync local state when store value changes (e.g., after localStorage load)
  useEffect(() => {
    if (engineGatewayState.engineGatewayUrl) {
      setEngineGatewayUrl(engineGatewayState.engineGatewayUrl)
    }
  }, [engineGatewayState.engineGatewayUrl])

  const handleSave = async () => {
    try {
      const response = await fetch(`http://${engineGatewayUrl}`)
      if (!response.ok) {
        throw new Error("The target engine gateway URL is not reachable")
      }

      props.onClose()
      engineGatewayStateActions.setEngineGatewayUrl(engineGatewayUrl)
    } catch (error) {
      enqueueSnackbar("The target engine gateway URL is not reachable", {
        variant: "error",
      })
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
    >
      <DialogTitle>Engine Gateway Settings</DialogTitle>
      <DialogContent>
        <TextField
          css={css({ marginTop: 8 })}
          label="Engine Gateway URL"
          value={engineGatewayUrl}
          onChange={e => setEngineGatewayUrl(e.target.value)}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button
          disabled={engineGatewayState.engineGatewayUrl == undefined}
          onClick={props.onClose}
        >
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
