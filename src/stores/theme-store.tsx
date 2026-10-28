"use client"

import { Roboto } from "next/font/google"
import { createTheme, responsiveFontSizes } from "@mui/material/styles"
import { ThemeProvider } from "@mui/material/styles"
import { useTheme } from "@mui/material/styles"
import {
  hexFromArgb,
  SchemeContent,
  sourceColorFromImage,
  DynamicScheme,
  Hct,
  MaterialDynamicColors,
  rgbaFromArgb,
  SchemeTonalSpot,
  TonalPalette,
  sanitizeDegreesDouble,
  // Blend,
} from "@material/material-color-utilities"
import {
  Dispatch,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { Backdrop, GlobalStyles } from "@mui/material"

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
})

// Copies from @material/material-color-utilities instead of importing
// `import Variant from '@material/material-color-utilities/scheme/variant';
// Because it's not exported from the package
enum Variant {
  MONOCHROME,
  NEUTRAL,
  TONAL_SPOT,
  VIBRANT,
  EXPRESSIVE,
  FIDELITY,
  CONTENT,
}

// 計算済みMaterial Designカラー
export interface MaterialColors {
  // Surface colors
  surface: string
  surfaceContainer: string
  surfaceContainerHighest: string
  surfaceContainerHigh: string
  surfaceContainerLow: string
  surfaceContainerLowest: string
  // Content colors
  primary: string
  secondary: string
  tertiary: string
  error: string
  // On colors
  onSurface: string
  onSurfaceVariant: string
  onPrimary: string
  onSecondary: string
  onTertiary: string
  onError: string
  // Additional colors
  outline: string
  outlineVariant: string
  inverseSurface: string
  inverseOnSurface: string
}

interface ThemeStateProps {
  scheme: DynamicScheme
  sourceColor: number
  colors: MaterialColors
}

const defaultSourceColor = 0x3450c3
// const defaultSourceColor = 0x156187
const defaultContrastLevel = 0.0
const defaultIsDark = true

function createScheme(sourceColor: number, isDark = defaultIsDark) {
  // const harmonizedColor = Blend.harmonize(
  //   0x156187,
  //   sourceColor,
  // )
  // console.log("@@@", hexFromArgb(harmonizedColor), harmonizedColor)
  return new SchemeContent(
    Hct.fromInt(sourceColor),
    isDark,
    defaultContrastLevel,
  )

  // return new SchemeTonalSpot(
  //   Hct.fromInt(sourceColor),
  //   true,
  //   defaultContrastLevel
  // )

  const sourceColorHct = Hct.fromInt(sourceColor)

  // console.trace(sourceColor, sourceColorHct.hue, sourceColorHct.chroma, sourceColorHct.tone)
  // console.log(Math.min(sourceColorHct.chroma + 16.0, 36.0))

  // Base SchemeTonalSpot
  // return new DynamicScheme({
  //   sourceColorArgb: sourceColor,
  //   variant: Variant.TONAL_SPOT,
  //   contrastLevel: 0.5,
  //   isDark: isDark,
  //   primaryPalette: TonalPalette.fromHueAndChroma(sourceColorHct.hue, 36.0),
  //   secondaryPalette: TonalPalette.fromHueAndChroma(sourceColorHct.hue, 16.0),
  //   tertiaryPalette: TonalPalette.fromHueAndChroma(
  //     sanitizeDegreesDouble(sourceColorHct.hue + 60.0),
  //     24.0,
  //   ),
  //   neutralPalette: TonalPalette.fromHueAndChroma(sourceColorHct.hue, 6.0),
  //   neutralVariantPalette:
  //     TonalPalette.fromHueAndChroma(sourceColorHct.hue, 8.0),
  // })

  return new DynamicScheme({
    sourceColorArgb: sourceColor,
    variant: Variant.TONAL_SPOT,
    contrastLevel: 0.3,
    isDark: isDark,
    primaryPalette: TonalPalette.fromHueAndChroma(
      sourceColorHct.hue,
      Math.min(sourceColorHct.chroma + 16.0, 36.0),
    ),
    secondaryPalette: TonalPalette.fromHueAndChroma(sourceColorHct.hue, 16.0),
    tertiaryPalette: TonalPalette.fromHueAndChroma(
      sanitizeDegreesDouble(sourceColorHct.hue + 60.0),
      24.0,
    ),
    neutralPalette: TonalPalette.fromHueAndChroma(sourceColorHct.hue, 6.0),
    neutralVariantPalette: TonalPalette.fromHueAndChroma(
      sourceColorHct.hue,
      8.0,
    ),
  })
}

function computeMaterialColors(scheme: DynamicScheme): MaterialColors {
  return {
    // Surface colors
    surface: hexFromArgb(MaterialDynamicColors.surface.getArgb(scheme)),
    surfaceContainer: hexFromArgb(
      MaterialDynamicColors.surfaceContainer.getArgb(scheme),
    ),
    surfaceContainerHighest: hexFromArgb(
      MaterialDynamicColors.surfaceContainerHighest.getArgb(scheme),
    ),
    surfaceContainerHigh: hexFromArgb(
      MaterialDynamicColors.surfaceContainerHigh.getArgb(scheme),
    ),
    surfaceContainerLow: hexFromArgb(
      MaterialDynamicColors.surfaceContainerLow.getArgb(scheme),
    ),
    surfaceContainerLowest: hexFromArgb(
      MaterialDynamicColors.surfaceContainerLowest.getArgb(scheme),
    ),
    // Content colors
    primary: hexFromArgb(MaterialDynamicColors.primary.getArgb(scheme)),
    secondary: hexFromArgb(MaterialDynamicColors.secondary.getArgb(scheme)),
    tertiary: hexFromArgb(MaterialDynamicColors.tertiary.getArgb(scheme)),
    error: hexFromArgb(MaterialDynamicColors.error.getArgb(scheme)),
    // On colors
    onSurface: hexFromArgb(MaterialDynamicColors.onSurface.getArgb(scheme)),
    onSurfaceVariant: hexFromArgb(
      MaterialDynamicColors.onSurfaceVariant.getArgb(scheme),
    ),
    onPrimary: hexFromArgb(MaterialDynamicColors.onPrimary.getArgb(scheme)),
    onSecondary: hexFromArgb(MaterialDynamicColors.onSecondary.getArgb(scheme)),
    onTertiary: hexFromArgb(MaterialDynamicColors.onTertiary.getArgb(scheme)),
    onError: hexFromArgb(MaterialDynamicColors.onError.getArgb(scheme)),
    // Additional colors
    outline: hexFromArgb(MaterialDynamicColors.outline.getArgb(scheme)),
    outlineVariant: hexFromArgb(
      MaterialDynamicColors.outlineVariant.getArgb(scheme),
    ),
    inverseSurface: hexFromArgb(
      MaterialDynamicColors.inverseSurface.getArgb(scheme),
    ),
    inverseOnSurface: hexFromArgb(
      MaterialDynamicColors.inverseOnSurface.getArgb(scheme),
    ),
  }
}

const defaultScheme = createScheme(defaultSourceColor)

export const ThemeStateContext = createContext<ThemeStateProps>({
  scheme: defaultScheme,
  sourceColor: defaultSourceColor,
  colors: computeMaterialColors(defaultScheme),
})

type Action = {
  type: "setTheme"
  payload: { scheme: DynamicScheme; sourceColor: number }
}

export const ThemeDispatchContext = createContext<Dispatch<Action>>(() => {})
export const useThemeStore = () => {
  const state = useContext(ThemeStateContext)
  const dispatch = useContext(ThemeDispatchContext)
  const refState = useRef(state)
  refState.current = state

  const actions = useMemo(() => {
    return {
      resetSourceColor: () => {
        const scheme = createScheme(defaultSourceColor)
        dispatch({
          type: "setTheme",
          payload: {
            scheme: scheme,
            sourceColor: defaultSourceColor,
          },
        })
      },
      setMode: (mode: "dark" | "light") => {
        const scheme = createScheme(
          refState.current.sourceColor,
          mode === "dark",
        )
        dispatch({
          type: "setTheme",
          payload: {
            scheme: scheme,
            sourceColor: refState.current.sourceColor,
          },
        })
      },
    }
  }, [])
  return [state, actions] as const
}

const reducer = (state: ThemeStateProps, action: Action): ThemeStateProps => {
  switch (action.type) {
    case "setTheme":
      const { scheme, sourceColor } = action.payload
      if (
        state.sourceColor === sourceColor &&
        state.scheme.isDark === scheme.isDark
      )
        return state

      window.localStorage.setItem("theme", scheme.isDark ? "dark" : "light")

      return {
        ...state,
        scheme: scheme,
        sourceColor: sourceColor,
        colors: computeMaterialColors(scheme),
      }
    default:
      return state
  }
}
const initState = (): ThemeStateProps => {
  // console.log(document)
  // const isDark = window.localStorage.getItem("theme") !== "light"
  const isDark =
    typeof window !== "undefined"
      ? window.localStorage.getItem("theme") !== "light"
      : defaultIsDark
  // const isDark =
  //   typeof window !== "undefined"
  //     ? (window as any).__INITIAL_THEME__ === "dark"
  //     : false

  const scheme = createScheme(defaultSourceColor, isDark)
  return {
    scheme,
    sourceColor: defaultSourceColor,
    colors: computeMaterialColors(scheme),
  }
}

export const ThemeStoreProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, null, initState)
  // console.log("@@@@", state)

  const theme = responsiveFontSizes(
    createTheme({
      palette: {
        mode: state.scheme.isDark ? "dark" : "light",
        primary: {
          main: state.colors.primary,
        },
        secondary: {
          main: state.colors.secondary,
        },
        background: {
          default: state.colors.surface,
          paper: state.colors.surfaceContainer,
        },
        error: {
          main: state.colors.error,
        },
        text: {
          primary: state.colors.onSurface,
        },
      },
      typography: {
        fontFamily: roboto.style.fontFamily,
      },
      components: {
        MuiDialog: {
          styleOverrides: {
            paper: {
              borderRadius: 28,
              backgroundColor: hexFromArgb(
                MaterialDynamicColors.surfaceContainerHigh.getArgb(state.scheme),
              ),
            },
          },
        },
        MuiDialogActions: {
          styleOverrides: {
            root: {
              padding: "16px 24px 24px",
            },
          },
        },
      },
    }),
  )

  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // if (!isMounted)
  //   return (
  //     <div
  //       css={{
  //         position: "fixed",
  //         background: "rgb(58, 58, 58)",
  //         width: "100vw",
  //         height: "100vh",
  //         top: 0,
  //         left: 0,
  //       }}
  //     ></div>
  //   )

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles
        styles={theme => ({
          // body: {
          //   transition: theme.transitions.create([
          //     "background-color",
          //     "transform",
          //   ]),
          // },
        })}
      />
      <ThemeStateContext.Provider value={state}>
        <ThemeDispatchContext.Provider value={dispatch}>
          {isMounted ? children : null}
          <Backdrop
            sx={{
              backgroundColor: "rgba(0, 0, 0, 0.8)",
            }}
            open={!isMounted}
            slotProps={{
              transition: {
                appear: false,
              },
            }}
          />
        </ThemeDispatchContext.Provider>
      </ThemeStateContext.Provider>
    </ThemeProvider>
  )
}
