"use client"

import { EngineGatewayStateProvider } from "../src/stores/engine-gateway-store"
import { NodeFlowColorsStoreProvider } from "@/src/stores/node-flow-colors-store"
import { RouterStoreProvider } from "@/src/stores/router-store"
import { useThemeStore } from "@/src/stores/theme-store"
import {
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
} from "@material/material-color-utilities"
import { styled } from "@mui/material"
import { MaterialDesignContent, SnackbarProvider } from "notistack"

const StyledMaterialDesignContent = styled(MaterialDesignContent)(() => {
  const [{ colors, scheme }] = useThemeStore()

  // Custom error colors based on error hue
  const errorSource = MaterialDynamicColors.error.getHct(scheme)
  const errorSurface = Hct.from(errorSource.hue, 10, 20).toInt()
  const errorOnSurface = Hct.from(errorSource.hue, 10, 80).toInt()

  return {
    "&.notistack-MuiContent-error": {
      backgroundColor: hexFromArgb(errorSurface),
      color: hexFromArgb(errorOnSurface),
    },
    "&.notistack-MuiContent-default": {
      backgroundColor: colors.inverseSurface,
      color: colors.inverseOnSurface,
    },
    "&.notistack-MuiContent": {
      flexWrap: "nowrap",
    },
  }
})

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      Components={{
        success: StyledMaterialDesignContent,
        error: StyledMaterialDesignContent,
        default: StyledMaterialDesignContent,
      }}
    >
      <RouterStoreProvider>
        <EngineGatewayStateProvider>
          <NodeFlowColorsStoreProvider>{children}</NodeFlowColorsStoreProvider>
        </EngineGatewayStateProvider>
      </RouterStoreProvider>
    </SnackbarProvider>
  )
}
