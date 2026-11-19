import { useMemo, useState } from "react"
import { List, ListItemButton, ListItemText, Popover } from "@mui/material"
import { Node, useReactFlow } from "@xyflow/react"
import { GraphEndpoint } from "nonoha-client-js"
import { PortAddDialog } from "@/src/components/node-add-menu/NodeAddDialog"
import type { BasicEngineNode } from "@/src/nodes/engine-nodes/basic-engine-node"
import { useViewCatalog, viewsForPort } from "@/src/views/view-catalog"
import { useInspectorLive } from "@/src/inspector/inspector-store"

export interface EdgeDropMenuState {
  screenPosition: { x: number; y: number }
  flowPosition: { x: number; y: number }
  sourceNodeId: string
  sourceHandleId: string | null
  sourceHandleType: "source" | "target"
}

interface EdgeDropContextMenuProps {
  state: EdgeDropMenuState | null
  graphEndpoint: GraphEndpoint | undefined
  onClose: () => void
  onPortCreated: (
    portNode: Node,
    connection: {
      sourceNodeId: string
      sourceHandleId: string | null
      portNodeId: string
      portType: "input" | "output"
    },
  ) => void
  existingPortNames?: string[]
  /** Show the dragged output in a view (dashed edge); offered when the inspector is on. */
  onViewSelected?: (viewKey: string, input: string) => void
}

/**
 * Extracts the value type list string from the source node's port.
 * Handles sub-value handles (e.g. "portName.0").
 */
function getValueTypeList(
  sourceNode: BasicEngineNode,
  handleId: string | null,
  handleType: "source" | "target",
): string {
  if (!handleId) return ""

  const ports =
    handleType === "source"
      ? sourceNode.data.nodeData.outputs
      : sourceNode.data.nodeData.inputs

  // Try exact match first
  const exactMatch = ports.find(p => p.name === handleId)
  if (exactMatch) {
    return exactMatch.values.map(v => v.type).join(",")
  }

  // Try sub-value handle (e.g. "portName.0")
  const lastDot = handleId.lastIndexOf(".")
  if (lastDot >= 0) {
    const baseName = handleId.substring(0, lastDot)
    const valueIndex = parseInt(handleId.substring(lastDot + 1))
    const basePort = ports.find(p => p.name === baseName)
    if (basePort && !isNaN(valueIndex) && valueIndex < basePort.values.length) {
      return basePort.values[valueIndex].type
    }
  }

  return ""
}

export function EdgeDropContextMenu({
  state,
  graphEndpoint,
  onClose,
  onPortCreated,
  existingPortNames,
  onViewSelected,
}: EdgeDropContextMenuProps) {
  const { getNode } = useReactFlow()
  const catalog = useViewCatalog()
  const inspectorLive = useInspectorLive()
  const [dialogOpen, setDialogOpen] = useState(false)

  // Determine port type: dragging from source handle → create output port
  //                       dragging from target handle → create input port
  const portType = state?.sourceHandleType === "target" ? "input" : "output"

  const initialValueTypeList = useMemo(() => {
    if (!state) return ""
    const sourceNode = getNode(state.sourceNodeId) as BasicEngineNode | undefined
    if (!sourceNode?.data?.nodeData) return ""
    return getValueTypeList(sourceNode, state.sourceHandleId, state.sourceHandleType)
  }, [state, getNode])

  // Views whose inputs accept the dragged output (best suited first).
  const viewSuggestions = useMemo(() => {
    if (!state || state.sourceHandleType !== "source" || !state.sourceHandleId || !onViewSelected) return []
    if (!inspectorLive) return []
    const sourceNode = getNode(state.sourceNodeId) as BasicEngineNode | undefined
    if (!sourceNode?.data?.nodeData) return []
    const firstType = initialValueTypeList.split(",")[0]?.trim()
    if (!firstType) return []
    return viewsForPort(catalog, sourceNode.data.nodeData.type, state.sourceHandleId, firstType).slice(0, 5)
  }, [state, getNode, catalog, initialValueTypeList, onViewSelected, inspectorLive])

  const handleMenuClick = () => {
    setDialogOpen(true)
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    onClose()
  }

  const handlePortAdd = (portNode: Node) => {
    if (!state) return
    onPortCreated(portNode, {
      sourceNodeId: state.sourceNodeId,
      sourceHandleId: state.sourceHandleId,
      portNodeId: portNode.id,
      portType,
    })
    setDialogOpen(false)
    onClose()
  }

  return (
    <>
      <Popover
        open={state !== null && !dialogOpen}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={
          state
            ? { top: state.screenPosition.y, left: state.screenPosition.x }
            : undefined
        }
        transitionDuration={0}
        slotProps={{
          paper: {
            sx: { borderRadius: 2, minWidth: 160 },
          },
        }}
      >
        <List dense disablePadding>
          <ListItemButton onClick={handleMenuClick}>
            <ListItemText
              primary={
                portType === "output"
                  ? "Create Output Port"
                  : "Create Input Port"
              }
            />
          </ListItemButton>
          {viewSuggestions.map(({ entry, input }) => (
            <ListItemButton
              key={entry.key}
              onClick={() => {
                onViewSelected?.(entry.key, input)
                onClose()
              }}
            >
              <ListItemText
                primary={`Show in ${entry.title}`}
                secondary={entry.source === "plugin" ? entry.pluginId : "built-in view"}
              />
            </ListItemButton>
          ))}
        </List>
      </Popover>

      <PortAddDialog
        open={dialogOpen}
        portType={portType}
        graphEndpoint={graphEndpoint}
        onClose={handleDialogClose}
        onPortAdd={handlePortAdd}
        initialValueTypeList={initialValueTypeList}
        initialPosition={state?.flowPosition}
        existingPortNames={existingPortNames}
      />
    </>
  )
}
