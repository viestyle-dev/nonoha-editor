import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  TextField,
} from "@mui/material"
import { Close, Search } from "@mui/icons-material"
import { css } from "@emotion/react"
import { useMemo, useState } from "react"
import { Node } from "@xyflow/react"
import { getNodeType } from "@/src/stores/node-flow-store"

export interface NodeSearchDialogProps {
  open: boolean
  onClose: () => void
  nodes: Node[]
  onNodeSelect: (nodeId: string) => void
}

interface SearchResult {
  id: string
  label: string
  type: "node" | "editor" | "input" | "output" | "waypoint"
  nodeType?: string
}

export const NodeSearchDialog = ({
  open,
  onClose,
  nodes,
  onNodeSelect,
}: NodeSearchDialogProps) => {
  const [searchText, setSearchText] = useState("")

  // Convert nodes to searchable results
  const allResults = useMemo((): SearchResult[] => {
    return nodes
      .filter(node => node.id !== "$graph") // Exclude graph container
      .map(node => {
        const nodeType = getNodeType(node.id)
        const label =
          typeof node.data?.label === "string" ? node.data.label : node.id

        return {
          id: node.id,
          label: label,
          type: nodeType,
          nodeType: node.type,
        }
      })
  }, [nodes])

  // Filter results based on search text
  const filteredResults = useMemo(() => {
    if (!searchText.trim()) {
      return allResults
    }

    const lowerSearch = searchText.toLowerCase()
    return allResults.filter(
      result =>
        result.id.toLowerCase().includes(lowerSearch) ||
        result.label.toLowerCase().includes(lowerSearch) ||
        (result.nodeType?.toLowerCase().includes(lowerSearch) ?? false)
    )
  }, [allResults, searchText])

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {
      node: [],
      editor: [],
      input: [],
      output: [],
    }

    filteredResults.forEach(result => {
      groups[result.type]?.push(result)
    })

    return groups
  }, [filteredResults])

  const handleNodeClick = (nodeId: string) => {
    onNodeSelect(nodeId)
  }

  const handleClose = () => {
    setSearchText("")
    onClose()
  }

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case "node":
        return "Engine Nodes"
      case "editor":
        return "Editor Nodes"
      case "input":
        return "Input Ports"
      case "output":
        return "Output Ports"
      default:
        return type
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEnforceFocus
      disableRestoreFocus
      slotProps={{
        backdrop: {
          sx: { backgroundColor: "transparent" },
        },
      }}
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
          paddingTop: "48px",
        },
        "& .MuiDialog-paper": {
          maxHeight: "45vh",
          margin: 0,
        },
      }}
    >
      <DialogTitle
        css={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 0,
        })}
      >
        Search Nodes
        <IconButton onClick={handleClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent
        css={css({
          display: "flex",
          flexDirection: "column",
          paddingTop: "16px !important",
        })}
      >
        <TextField
          placeholder="Search by ID, label, or type..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          fullWidth
          size="small"
          autoFocus
          autoComplete="off"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
          css={css({ marginBottom: 8 })}
        />

        <List
          css={css({
            flexGrow: 1,
            overflowY: "auto",
            paddingTop: 0,
          })}
          dense
        >
          {(["node", "editor", "input", "output"] as const).map(type => {
            const items = groupedResults[type]
            if (items.length === 0) return null

            return (
              <div key={type}>
                <ListSubheader
                  css={css({
                    // backgroundColor: "transparent",
                    lineHeight: "32px",
                  })}
                >
                  {getTypeLabel(type)} ({items.length})
                </ListSubheader>
                {items.map(result => (
                  <ListItemButton
                    key={result.id}
                    onClick={() => handleNodeClick(result.id)}
                    css={css({
                      paddingLeft: 24,
                    })}
                  >
                    <ListItemText
                      primary={result.label}
                      secondary={
                        result.label !== result.id ? result.id : undefined
                      }
                      primaryTypographyProps={{
                        noWrap: true,
                        css: css({ fontFamily: "monospace", fontSize: 14 }),
                      }}
                      secondaryTypographyProps={{
                        noWrap: true,
                        css: css({ fontFamily: "monospace", fontSize: 12 }),
                      }}
                    />
                  </ListItemButton>
                ))}
              </div>
            )
          })}

          {filteredResults.length === 0 && (
            <ListItemText
              css={css({
                textAlign: "center",
                padding: 16,
                color: "text.secondary",
              })}
              primary="No results found"
            />
          )}
        </List>
      </DialogContent>
    </Dialog>
  )
}
