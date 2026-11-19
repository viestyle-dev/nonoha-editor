import { ReactFlowState, useStore } from "@xyflow/react"

const zoomSelector = (s: ReactFlowState) => s.transform[2]

/** The viewport's zoom; re-renders when it changes, not on every pan frame (unlike useViewport). */
export function useZoom(): number {
  return useStore(zoomSelector)
}
