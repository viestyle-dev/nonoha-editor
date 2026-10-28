import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react"

interface EngineGatewayStateProps {
  engineGatewayUrl: string | undefined
  initialized: boolean
}

export const EngineGatewayStateContext = createContext<EngineGatewayStateProps>(
  {
    engineGatewayUrl: undefined,
    initialized: false,
  }
)

type Action =
  | {
      type: "setEngineGatewayUrl"
      payload: {
        engineGatewayUrl: string
      }
    }
  | {
      type: "setInitialized"
    }

export const EngineGatewayStateDispatchContext = createContext<
  React.Dispatch<Action>
>(() => {})

const DB_KEY_ENGINE_URI = "engineUri"

export const useEngineGatewayStateStore = () => {
  const state = useContext(EngineGatewayStateContext)
  const dispatch = useContext(EngineGatewayStateDispatchContext)
  const stateRef = useRef(state)
  stateRef.current = state

  const actions = useMemo(() => {
    return {
      setEngineGatewayUrl: (engineGatewayUrl: string) => {
        dispatch({
          type: "setEngineGatewayUrl",
          payload: {
            engineGatewayUrl,
          },
        })
      },
    }
  }, [])

  return [state, actions] as const
}

const reducer = (
  state: EngineGatewayStateProps,
  action: Action
): EngineGatewayStateProps => {
  switch (action.type) {
    case "setEngineGatewayUrl":
      localStorage.setItem(DB_KEY_ENGINE_URI, action.payload.engineGatewayUrl)
      return {
        ...state,
        engineGatewayUrl: action.payload.engineGatewayUrl,
      }
    case "setInitialized":
      return {
        ...state,
        initialized: true,
      }
    default:
      return state
  }
}

export const EngineGatewayStateProvider = ({
  children,
}: {
  children: React.ReactNode
  }) => {
  const [state, dispatch] = useReducer(reducer, {
    engineGatewayUrl: undefined,
    initialized: false,
  })

  const initializingFirstCalled = useRef(false)
  useEffect(() => {
    if (initializingFirstCalled.current) {
      return
    }
    // console.log(window.Location, window.location.search)
    const queryParams = new URLSearchParams(window.location.search)
    const uriInQuery = queryParams.get("engine-uri")
    const uriInLocalStorage = localStorage.getItem(DB_KEY_ENGINE_URI)

    const engineUri = uriInQuery || uriInLocalStorage

    if (engineUri) {
      dispatch({
        type: "setEngineGatewayUrl",
        payload: {
          engineGatewayUrl: engineUri,
        },
      })
    }

    dispatch({
      type: "setInitialized",
    })

    return () => {
      initializingFirstCalled.current = true
    }
  }, [])

  return (
    <EngineGatewayStateContext.Provider value={state}>
      <EngineGatewayStateDispatchContext.Provider value={dispatch}>
        {children}
      </EngineGatewayStateDispatchContext.Provider>
    </EngineGatewayStateContext.Provider>
  )
}