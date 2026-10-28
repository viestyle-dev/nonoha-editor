"use client"

import { createContext, useContext, useMemo, useReducer } from "react"
import type { EditorModelUpdater } from "@/src/api/editor-model-updater"
import type { GraphEndpoint } from "nonoha-client-js"

interface GraphSessionStateProps {
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater | undefined
}

const initialState: GraphSessionStateProps = {
  graphEndpoint: undefined,
  editorModelUpdater: undefined,
}

export const GraphSessionStateContext =
  createContext<GraphSessionStateProps>(initialState)

type Action = {
  type: "setSession"
  payload: {
    graphEndpoint: GraphEndpoint
    editorModelUpdater: EditorModelUpdater
  }
}

export const GraphSessionDispatchContext = createContext<
  React.Dispatch<Action>
>(() => {})

const reducer = (
  state: GraphSessionStateProps,
  action: Action,
): GraphSessionStateProps => {
  switch (action.type) {
    case "setSession":
      return {
        ...state,
        graphEndpoint: action.payload.graphEndpoint,
        editorModelUpdater: action.payload.editorModelUpdater,
      }
    default:
      return state
  }
}

export const useGraphSessionStore = () => {
  const state = useContext(GraphSessionStateContext)
  const dispatch = useContext(GraphSessionDispatchContext)

  const actions = useMemo(() => {
    return {
      setSession: (
        graphEndpoint: GraphEndpoint,
        editorModelUpdater: EditorModelUpdater,
      ) => {
        dispatch({
          type: "setSession",
          payload: { graphEndpoint, editorModelUpdater },
        })
      },
    }
  }, [dispatch])

  return [state, actions] as const
}

export const GraphSessionStoreProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [state, dispatch] = useReducer(reducer, initialState)

  return (
    <GraphSessionStateContext.Provider value={state}>
      <GraphSessionDispatchContext.Provider value={dispatch}>
        {children}
      </GraphSessionDispatchContext.Provider>
    </GraphSessionStateContext.Provider>
  )
}
