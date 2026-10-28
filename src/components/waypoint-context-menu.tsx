import { useMemo } from "react"
import {
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Popover,
} from "@mui/material"
import { LinkOff } from "@mui/icons-material"
import { useReactFlow } from "@xyflow/react"
import { getEditorEdgeId } from "@/src/api/editor-model-updater"
import { useGraphSessionStore } from "@/src/stores/graph-session-store"

interface PassingEdge {
  edgeId: string
  editorEdgeId: string
  sourceLabel: string
  targetLabel: string
  source: string
  sourceHandle: string | null
  target: string
  targetHandle: string | null
  waypointIds: string[]
  hasEditorEndpoint: boolean
}

interface WaypointContextMenuProps {
  waypointId: string
  anchorPosition: { top: number; left: number }
  onClose: () => void
}

export function WaypointContextMenu({
  waypointId,
  anchorPosition,
  onClose,
}: WaypointContextMenuProps) {
  const { getEdges, setEdges, setNodes } = useReactFlow()
  const [{ editorModelUpdater }] = useGraphSessionStore()
  const editorModelUrl = editorModelUpdater?.editorModelUrl

  const passingEdges = useMemo((): PassingEdge[] => {
    return getEdges()
      .filter(edge => {
        const wpIds = (edge.data as Record<string, unknown>)
          ?.waypointIds as string[] | undefined
        return wpIds?.includes(waypointId)
      })
      .map(edge => {
        const data = edge.data as Record<string, unknown> | undefined
        const sourceType = (data?.source as { type: string } | undefined)?.type
        const targetType = (data?.target as { type: string } | undefined)?.type
        return {
          edgeId: edge.id,
          editorEdgeId: getEditorEdgeId(
            edge.source,
            edge.sourceHandle ?? null,
            edge.target,
            edge.targetHandle ?? null,
          ),
          sourceLabel: edge.source.replace(/^\$\w+:/, ""),
          targetLabel: edge.target.replace(/^\$\w+:/, ""),
          source: edge.source,
          sourceHandle: edge.sourceHandle ?? null,
          target: edge.target,
          targetHandle: edge.targetHandle ?? null,
          waypointIds: (data?.waypointIds as string[]) ?? [],
          hasEditorEndpoint: sourceType === "editor" || targetType === "editor",
        }
      })
  }, [getEdges, waypointId])

  const handleHighlight = (edgeId: string, highlight: boolean) => {
    setEdges(edges =>
      edges.map(edge =>
        edge.id === edgeId
          ? { ...edge, data: { ...edge.data, highlighted: highlight } }
          : edge,
      ),
    )
  }

  const handleSelectEdge = (pe: PassingEdge) => {
    setEdges(edges =>
      edges.map(edge => ({
        ...edge,
        selected: edge.id === pe.edgeId,
        data: { ...edge.data, highlighted: false },
      })),
    )
    setNodes(nodes =>
      nodes.map(node => ({ ...node, selected: false })),
    )
    onClose()
  }

  const handleDetach = (pe: PassingEdge) => {
    const newWpIds = pe.waypointIds.filter(id => id !== waypointId)

    setEdges(edges =>
      edges.map(edge =>
        edge.id === pe.edgeId
          ? {
              ...edge,
              data: {
                ...edge.data,
                waypointIds: newWpIds,
                highlighted: false,
              },
            }
          : edge,
      ),
    )

    // Persist
    if (!editorModelUpdater) return
    if (newWpIds.length === 0 && !pe.hasEditorEndpoint) {
      // Engine edge with no waypoints — remove redundant editor_edges entry
      editorModelUpdater.removeEditorEdge(pe.editorEdgeId)
    } else {
      fetch(`${editorModelUrl}?query=editor_edges.${pe.editorEdgeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: pe.source,
          sourceHandle: pe.sourceHandle,
          target: pe.target,
          targetHandle: pe.targetHandle,
          waypoints: newWpIds,
        }),
      })
    }

    onClose()
  }

  return (
    <Popover
      open
      onClose={() => {
        // Clear all highlights on close
        setEdges(edges =>
          edges.map(edge => {
            if ((edge.data as Record<string, unknown>)?.highlighted) {
              return { ...edge, data: { ...edge.data, highlighted: false } }
            }
            return edge
          }),
        )
        onClose()
      }}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
      transitionDuration={0}
      slotProps={{
        paper: {
          sx: { borderRadius: 2, minWidth: 200 },
        },
      }}
    >
      <List dense disablePadding>
        {passingEdges.map(pe => (
          <ListItemButton
            key={pe.edgeId}
            onMouseEnter={() => handleHighlight(pe.edgeId, true)}
            onMouseLeave={() => handleHighlight(pe.edgeId, false)}
            onClick={() => handleSelectEdge(pe)}
          >
            <ListItemText
              primary={`${pe.sourceLabel} → ${pe.targetLabel}`}
              secondary="Click to select"
            />
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                handleDetach(pe)
              }}
            >
              <LinkOff fontSize="small" />
            </IconButton>
          </ListItemButton>
        ))}
        {passingEdges.length === 0 && (
          <ListItemText
            primary="No edges"
            sx={{ px: 2, py: 1, color: "text.secondary" }}
          />
        )}
      </List>
    </Popover>
  )
}
