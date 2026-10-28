import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react"
import { useThemeStore } from "./theme-store"
import { DynamicScheme, Hct } from "@material/material-color-utilities"
import { nameToPortDataType } from "nonoha-client-js"

interface NodeFlowColorsState {
  pallet: {
    dataTypes: {
      [key: string]: Hct
    }
  }
}

export const NodeFlowColorsStateContext = createContext<NodeFlowColorsState>({
  pallet: {
    dataTypes: {},
  },
})

type Action = {
  type: "setPalette"
  payload: NodeFlowColorsState["pallet"]
}

export const NodeFlowColorsDispatchContext = createContext<
  React.Dispatch<Action>
>(() => {})

export const useNodeFlowColorsStore = () => {
  const state = useContext(NodeFlowColorsStateContext)
  const dispatch = useContext(NodeFlowColorsDispatchContext)
  const refState = useRef(state)
  refState.current = state

  const actions = useMemo(() => {}, [])

  return [state, actions] as const
}

const reducer = (
  state: NodeFlowColorsState,
  action: Action
): NodeFlowColorsState => {
  switch (action.type) {
    case "setPalette":
      return {
        ...state,
        pallet: action.payload,
      }
  }
}

function buildPallet(scheme: DynamicScheme) {
  const dataTypesPallet = Object.keys(nameToPortDataType).reduce(
    (acc, dataTypeName) => {
      const dataType = nameToPortDataType[dataTypeName]
      const hue = (dataType / 15) * 360
      const color = Hct.from(hue, 60, 60)
      acc[dataTypeName] = color
      return acc
    },
    {} as { [key: string]: Hct }
  )
  return {
    dataTypes: dataTypesPallet,
  }
}

export function getHctFromPortValueType(
  type: string,
  dataTypesPallet: NodeFlowColorsState["pallet"]
) {
  const baseTypeName = type.split("[")[0]
  const baseType = nameToPortDataType[baseTypeName]
  if (baseType === undefined) {
    throw new Error(`Unknown data type: ${type}`)
  }
  return dataTypesPallet.dataTypes[baseTypeName]
}

export const NodeFlowColorsStoreProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, {
    pallet: {
      dataTypes: {},
    },
  })

  const [themeState] = useThemeStore()
  useEffect(() => {
    const pallet = buildPallet(themeState.scheme)
    dispatch({ type: "setPalette", payload: pallet })
  }, [themeState.scheme])

  return (
    <NodeFlowColorsStateContext.Provider value={state}>
      <NodeFlowColorsDispatchContext.Provider value={dispatch}>
        {children}
      </NodeFlowColorsDispatchContext.Provider>
    </NodeFlowColorsStateContext.Provider>
  )
}
