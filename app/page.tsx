"use client"

import {
  Typography,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  AppBar,
  Toolbar,
  IconButton,
  Menu,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
} from "@mui/material"
import { useEffect, useState } from "react"
import { css } from "@emotion/react"

import "@xyflow/react/dist/style.css"
import { useEngineGatewayStateStore } from "../src/stores/engine-gateway-store"
import { EngineGatewaySettingsDialog } from "@/src/components/engine-gateway-settings-dialog"
import { enqueueSnackbar } from "notistack"
import { useRouter } from "next/navigation"
import { useThemeStore } from "@/src/stores/theme-store"
import { DarkMode, LightMode, MoreVert } from "@mui/icons-material"

export default function Page() {
  const [engineGatewayState, engineGatewayStateActions] =
    useEngineGatewayStateStore()
  const [engineGatewaySettingsDialogOpen, setEngineGatewaySettingsDialogOpen] =
    useState(false)
  const router = useRouter()

  const [themeState, themeStoreActions] = useThemeStore()
  const { colors } = themeState
  const [settingsMenuAnchorEl, setSettingsMenuAnchorEl] =
    useState<HTMLElement | null>(null)

  const [graphNames, setGraphNames] = useState<string[]>([])

  useEffect(() => {
    if (!engineGatewayState.initialized) {
      return
    }

    const engineGatewayUrl = engineGatewayState.engineGatewayUrl
    if (engineGatewayUrl == undefined) {
      setEngineGatewaySettingsDialogOpen(true)
      return
    }

    fetch(`http://${engineGatewayUrl}/node-flow/graphs`)
      .then(response => response.json())
      .then(data => {
        // console.log(data)
        setGraphNames(data as string[])
      })
      .catch(error => {
        console.error(error)
        enqueueSnackbar(`Failed to fetch graphs. ${error}`, {
          variant: "error",
        })
      })
  }, [engineGatewayState.initialized, engineGatewayState.engineGatewayUrl])

  return (
    <div>
      <AppBar
        position="fixed"
        elevation={0}
        css={css({
          color: colors.onSurface,
          backgroundColor: alpha(colors.surface, 0.5),
          backdropFilter: "blur(16px)",
        })}
      >
        <Toolbar>
          <Typography variant="h6" color={colors.primary}>
            nonoha Editor
          </Typography>
          <div css={css({ flexGrow: 1 })} />
          <div>
            <IconButton
              color="inherit"
              edge="end"
              onClick={event => {
                setSettingsMenuAnchorEl(event.currentTarget)
              }}
            >
              <MoreVert />
            </IconButton>
            <Menu
              open={Boolean(settingsMenuAnchorEl)}
              anchorEl={settingsMenuAnchorEl}
              onClose={() => {
                setSettingsMenuAnchorEl(null)
              }}
            >
              <MenuItem
                onClick={() => {
                  setEngineGatewaySettingsDialogOpen(true)
                  setSettingsMenuAnchorEl(null)
                }}
              >
                Engine Gateway Settings
              </MenuItem>
              <div
                css={css({
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 16,
                  paddingLeft: 16,
                  paddingRight: 16,
                })}
              >
                <Typography css={css({})}>Theme Mode</Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive={true}
                  value={themeState.scheme.isDark ? "dark" : "light"}
                  onChange={(event, newValue) => {
                    console.log(newValue)
                    themeStoreActions.setMode(newValue)
                  }}
                >
                  <ToggleButton
                    value="light"
                    css={css({
                      flexGrow: 1,
                    })}
                  >
                    <LightMode />
                  </ToggleButton>
                  <ToggleButton
                    value="dark"
                    css={css({
                      flexGrow: 1,
                    })}
                  >
                    <DarkMode />
                  </ToggleButton>
                </ToggleButtonGroup>
              </div>
            </Menu>
          </div>
        </Toolbar>
      </AppBar>
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          marginTop: "80px",
          paddingLeft: "16px",
          paddingRight: "16px",
          marginLeft: "auto",
          marginRight: "auto",
          maxWidth: "1040px",
          marginBottom: "32px",
        })}
      >
        <Typography variant="h6">Graphs</Typography>
        <List>
          {graphNames.map(graphName => (
            <ListItem key={graphName}>
              <ListItemButton
                onClick={() => {
                  router.push(`/graphs/#${graphName}`)
                }}
              >
                <ListItemText primary={graphName} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <EngineGatewaySettingsDialog
          open={engineGatewaySettingsDialogOpen}
          onClose={() => {
            setEngineGatewaySettingsDialogOpen(false)
          }}
        />
      </div>
    </div>
  )
}
