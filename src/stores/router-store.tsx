"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react"
import { useParams, usePathname, useRouter } from "next/navigation"

interface RouterStateProps {
  pathname: string
  hash: string
}

export const RouterStateContext = createContext<RouterStateProps>({
  pathname: "",
  hash: "",
})

type Action = {
  type: "setLocation"
  payload: {
    pathname: string
    hash: string
  }
}

export const RouterDispatchContext = createContext<React.Dispatch<Action>>(
  () => {}
)

export const useRouterStore = () => {
  const state = useContext(RouterStateContext)
  const dispatch = useContext(RouterDispatchContext)
  const router = useRouter()

  const actions = useMemo(() => {}, [router])

  return [state, actions] as const
}

const reducer = (state: RouterStateProps, action: Action): RouterStateProps => {
  switch (action.type) {
    case "setLocation":
      return {
        pathname: action.payload.pathname,
        hash: action.payload.hash,
      }
    default:
      return state
  }
}

export const RouterStoreProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, {
    pathname: "",
    hash: "",
  })

  const params = useParams()
  const pathname = usePathname()

    useEffect(() => {
    dispatch({
      type: "setLocation",
      payload: { pathname, hash: window.location.hash },
    })
  }, [params, pathname])

  return (
    <RouterStateContext.Provider value={state}>
      <RouterDispatchContext.Provider value={dispatch}>
        {children}
      </RouterDispatchContext.Provider>
    </RouterStateContext.Provider>
  )
}
