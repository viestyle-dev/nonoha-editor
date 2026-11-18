"use client"

import { useMemo } from "react"
import { useTheme } from "@mui/material/styles"

import { useThemeStore } from "@/src/stores/theme-store"
import { ChartTheme, deriveChartTheme } from "@/src/lib/chart-theme"

/**
 * Chart colours/typography for the current editor theme. The returned object
 * only changes identity when the theme (mode or source colour) changes, so
 * chart components can use it as an effect dependency to restyle in place.
 */
export function useChartTheme(): ChartTheme {
  const [{ colors, scheme }] = useThemeStore()
  const fontFamily = useTheme().typography.fontFamily
  const isDark = scheme.isDark
  return useMemo(
    () => deriveChartTheme(colors, isDark, fontFamily),
    [colors, isDark, fontFamily],
  )
}
