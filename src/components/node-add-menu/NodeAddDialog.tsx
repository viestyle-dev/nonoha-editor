import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListSubheader,
  TextField,
} from "@mui/material"
import { Close } from "@mui/icons-material"
import { css } from "@emotion/react"
import { Node, useReactFlow } from "@xyflow/react"
import { GraphEndpoint } from "nonoha-client-js"
import { enqueueSnackbar } from "notistack"
import {
  getEngineNodeUIType,
  getEngineNodeVariant,
  makeEditorNode,
  NodeRegistry,
} from "@/src/stores/node-flow-store"
import { generateEditorNodeId } from "@/src/lib/id-generator"
import { useNodeCatalog } from "@/src/stores/node-catalog-store"
import { EDITOR_NODE_CATALOG } from "./editor-node-catalog"
import { NodeListPanel, categorySort, sourceSort } from "./NodeListPanel"
import { NodeDetailPanel } from "./NodeDetailPanel"
import type { NodePrototype, UnifiedNodeEntry, CatalogPortInfo } from "./types"

// Characters forbidden in port names (used as delimiters in backend parsing)
const FORBIDDEN_PORT_NAME_CHARS = /[.\-$]/
const FORBIDDEN_PORT_NAME_CHARS_MESSAGE =
  "Port name cannot contain '.', '-', or '$'"

function validatePortName(name: string): string | null {
  if (name === "") return null
  if (FORBIDDEN_PORT_NAME_CHARS.test(name)) {
    return FORBIDDEN_PORT_NAME_CHARS_MESSAGE
  }
  return null
}

// --- PortAddDialog ---

export interface PortAddDialogProps {
  open: boolean
  portType: "input" | "output"
  graphEndpoint: GraphEndpoint | undefined
  onClose: () => void
  onPortAdd: (port: Node) => void
  /** Pre-filled value type list (e.g. "f32,f32"). User can still edit. */
  initialValueTypeList?: string
  /** Flow-coordinate position for the new port node. Falls back to screen center. */
  initialPosition?: { x: number; y: number }
  /** Existing port names for duplicate validation and reference display. */
  existingPortNames?: string[]
}

export function PortAddDialog({
  portType,
  open,
  onClose,
  graphEndpoint,
  onPortAdd,
  initialValueTypeList,
  initialPosition,
  existingPortNames,
}: PortAddDialogProps) {
  const [portName, setPortName] = useState("")
  const [valueTypeList, setValueTypeList] = useState("")

  // Reset fields when dialog opens
  useEffect(() => {
    if (open) {
      setPortName("")
      setValueTypeList(initialValueTypeList ?? "")
    }
  }, [open, initialValueTypeList])

  const portNameError = useMemo(() => {
    const charError = validatePortName(portName)
    if (charError) return charError
    if (portName !== "" && existingPortNames?.includes(portName)) {
      return "Port name already exists"
    }
    return null
  }, [portName, existingPortNames])

  const isFormValid =
    portName !== "" && portNameError === null && valueTypeList !== ""

  const { screenToFlowPosition } = useReactFlow()

  const handleAdd = async () => {
    if (portName === "" || valueTypeList === "") {
      enqueueSnackbar("invalid input", { variant: "error" })
      return
    }
    if (!graphEndpoint) return

    const endpoint = portType === "input" ? "inputs" : "outputs"
    const response = await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphEndpoint.graphName)}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: portName,
          values: valueTypeList.split(",").map(t => ({ type: t.trim() })),
        }),
      },
    )
    if (!response.ok) {
      const error = await response.text()
      enqueueSnackbar(`${error}`, { variant: "error" })
      return
    }

    const portData = await response.json()
    enqueueSnackbar(`Added ${portType} port ${portName}`)

    const nodeId =
      portType === "input"
        ? `$input:${portData.name}`
        : `$output:${portData.name}`

    const position = initialPosition ?? screenToFlowPosition({ x: 100, y: 100 })

    onPortAdd({
      id: nodeId,
      data: { label: portData.name, port: portData },
      position,
      type: "BasicPortNode",
      dragHandle: ".drag-handle",
      parentId: "$graph",
    } as Node)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: 320 },
      }}
    >
      <DialogTitle>
        Add {portType === "input" ? "Input" : "Output"} Port
      </DialogTitle>
      <DialogContent css={css({ overflow: "visible" })}>
        <Autocomplete
          css={css({ marginTop: 8 })}
          freeSolo
          options={existingPortNames ?? []}
          inputValue={portName}
          onInputChange={(_e, value, reason) => {
            if (reason !== "reset") setPortName(value)
          }}
          onChange={(_e, value) => {
            if (typeof value === "string") setPortName(value)
          }}
          filterOptions={(options, { inputValue }) => {
            if (!inputValue) return []
            return options.filter(o => o.includes(inputValue))
          }}
          groupBy={() => "Existing ports"}
          renderGroup={params => (
            <li key={params.key}>
              <ListSubheader
                component="div"
                sx={{
                  backgroundColor: "background.paper",
                  lineHeight: "32px",
                  paddingTop: "8px",
                }}
              >
                {params.group}
              </ListSubheader>
              <ul css={css({ padding: 0, margin: 0 })}>{params.children}</ul>
            </li>
          )}
          renderInput={params => (
            <TextField
              {...params}
              label="Port Name"
              autoFocus
              error={portNameError !== null}
              helperText={portNameError}
              slotProps={{
                htmlInput: {
                  ...params.inputProps,
                  autoComplete: "off",
                },
              }}
            />
          )}
          slotProps={{
            listbox: {
              sx: {
                maxHeight: 240,
                paddingTop: 0,
                paddingBottom: 0,
                "& .MuiAutocomplete-option": {
                  minHeight: 32,
                  padding: "2px 16px",
                  fontSize: "0.875rem",
                },
              },
            },
          }}
        />
        <TextField
          css={css({ marginTop: 8 })}
          variant="standard"
          label="Value Type List"
          placeholder="f32,f32"
          value={valueTypeList}
          onChange={e => setValueTypeList(e.target.value)}
          fullWidth
          autoComplete="off"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={!isFormValid} onClick={handleAdd}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// --- Main Dialog ---

export interface NodeAddDialogProps {
  open: boolean
  nodeRegistry: NodeRegistry
  graphEndpoint: GraphEndpoint | undefined
  onClose: () => void
  nodePrototypes: NodePrototype[]
  onNodeAdd: (node: Node) => void
  graphEditDisabled: boolean
  existingInputPortNames?: string[]
  existingOutputPortNames?: string[]
}

export function NodeAddDialog({
  open,
  nodeRegistry,
  graphEndpoint,
  onClose,
  nodePrototypes,
  onNodeAdd,
  graphEditDisabled,
  existingInputPortNames,
  existingOutputPortNames,
}: NodeAddDialogProps) {
  const catalogState = useNodeCatalog()
  const { screenToFlowPosition } = useReactFlow()

  const nodeRegistryRef = useRef(nodeRegistry)
  nodeRegistryRef.current = nodeRegistry
  const onNodeAddRef = useRef(onNodeAdd)
  onNodeAddRef.current = onNodeAdd

  const [searchText, setSearchText] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  )
  const [portAddDialogState, setPortAddDialogState] = useState<{
    open: boolean
    portType: "input" | "output"
  }>({ open: false, portType: "input" })

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearchText("")
      setSelectedKey(null)
    }
  }, [open])

  // Build unified entries from catalog + editor + ports
  const unifiedEntries = useMemo((): UnifiedNodeEntry[] => {
    const result: UnifiedNodeEntry[] = []

    // Editor nodes
    for (const proto of nodePrototypes) {
      const meta = EDITOR_NODE_CATALOG[proto.type]
      result.push({
        key: `editor:${proto.type}`,
        label: meta?.label ?? proto.data.label,
        category: meta?.category ?? "Editor",
        description: meta?.description ?? "",
        inputCount: meta?.inputs.length ?? 0,
        outputCount: meta?.outputs.length ?? 0,
        source: "editor",
        prototype: proto,
        _editorInputs: meta?.inputs as CatalogPortInfo[] | undefined,
        _editorOutputs: meta?.outputs as CatalogPortInfo[] | undefined,
      } as UnifiedNodeEntry & {
        _editorInputs?: CatalogPortInfo[]
        _editorOutputs?: CatalogPortInfo[]
      })
    }

    // Engine nodes from catalog
    if (!graphEditDisabled) {
      for (const entry of Array.from(catalogState.entries.values())) {
        result.push({
          key: `engine:${entry.type}`,
          label: entry.type,
          category: entry.category || "Uncategorized",
          description: entry.description,
          inputCount: entry.inputs.length,
          outputCount: entry.outputs.length,
          source: "engine",
          catalogEntry: entry,
        })
      }

      // Port entries
      result.push({
        key: "port:input",
        label: "InputPort",
        category: "Ports",
        description: "Add a custom input port to the graph",
        inputCount: 0,
        outputCount: 0,
        source: "port",
        portType: "input",
      })
      result.push({
        key: "port:output",
        label: "OutputPort",
        category: "Ports",
        description: "Add a custom output port to the graph",
        inputCount: 0,
        outputCount: 0,
        source: "port",
        portType: "output",
      })
    }

    return result
  }, [nodePrototypes, catalogState.entries, graphEditDisabled])

  // Filter
  const filteredEntries = useMemo(() => {
    if (!searchText) return unifiedEntries
    const lower = searchText.toLowerCase()
    return unifiedEntries.filter(
      e =>
        e.label.toLowerCase().includes(lower) ||
        e.description.toLowerCase().includes(lower) ||
        e.category.toLowerCase().includes(lower),
    )
  }, [unifiedEntries, searchText])

  // Visible entries — sorted by source then category (matching display order), excludes collapsed
  const visibleEntries = useMemo(() => {
    const sorted = [...filteredEntries].sort((a, b) => {
      const s = sourceSort(a.source, b.source)
      if (s !== 0) return s
      return categorySort(
        a.category || "Uncategorized",
        b.category || "Uncategorized",
      )
    })
    if (searchText) return sorted
    return sorted.filter(e => !collapsedCategories.has(e.category))
  }, [filteredEntries, searchText, collapsedCategories])

  // Selected entry
  const selectedEntry = useMemo(
    () => filteredEntries.find(e => e.key === selectedKey) ?? null,
    [filteredEntries, selectedKey],
  )

  // Auto-select first visible entry when filter results change
  useEffect(() => {
    if (visibleEntries.length > 0) {
      setSelectedKey(visibleEntries[0].key)
    } else {
      setSelectedKey(null)
    }
  }, [visibleEntries])

  // Add node handler
  const handleAddNode = useCallback(
    async (entry: UnifiedNodeEntry) => {
      if (entry.source === "port") {
        setPortAddDialogState({
          open: true,
          portType: entry.portType!,
        })
        return
      }

      if (entry.source === "editor" && entry.prototype) {
        const uniqueId = generateEditorNodeId(entry.prototype.type)
        const nodeToAdd = nodeRegistryRef.current.registerEditorNode(
          makeEditorNode({
            ...entry.prototype,
            id: uniqueId,
            data: {
              ...entry.prototype.data,
              label: uniqueId,
            },
            position: screenToFlowPosition({ x: 100, y: 100 }),
            dragHandle: ".drag-handle",
          } as Node),
        )
        onNodeAddRef.current(nodeToAdd)
        onClose()
        return
      }

      if (entry.source === "engine" && entry.catalogEntry) {
        try {
          const response = await fetch(
            `http://${graphEndpoint?.engineGatewayUrl}/node-flow/graphs/${graphEndpoint?.graphName}/nodes`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: entry.catalogEntry.type }),
            },
          )
          if (!response.ok) {
            const error = await response.text()
            throw new Error(error)
          }
          const nodeData = await response.json()
          const nodeToAdd = {
            id: nodeData.name,
            data: {
              label: nodeData.name,
              variant: getEngineNodeVariant(nodeData.type),
              nodeData: nodeData,
              graphEndpoint: graphEndpoint,
            },
            position: screenToFlowPosition({ x: 100, y: 100 }),
            type: getEngineNodeUIType(nodeData.type),
            dragHandle: ".drag-handle",
            parentId: "$graph",
          } as Node
          onNodeAddRef.current(nodeToAdd)
          onClose()
        } catch (error) {
          console.error("Error adding node", error)
          enqueueSnackbar(`${error}`, { variant: "error" })
        }
      }
    },
    [graphEndpoint, screenToFlowPosition, onClose],
  )

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const currentIndex = visibleEntries.findIndex(
          entry => entry.key === selectedKey,
        )
        let nextIndex: number
        if (e.key === "ArrowDown") {
          nextIndex =
            currentIndex < visibleEntries.length - 1 ? currentIndex + 1 : 0
        } else {
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : visibleEntries.length - 1
        }
        const nextEntry = visibleEntries[nextIndex]
        if (nextEntry) {
          setSelectedKey(nextEntry.key)
          const el = document.querySelector(
            `[data-node-key="${CSS.escape(nextEntry.key)}"]`,
          )
          el?.scrollIntoView({ block: "nearest" })
        }
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (selectedEntry) {
          handleAddNode(selectedEntry)
        }
      }
    },
    [visibleEntries, selectedKey, selectedEntry, handleAddNode],
  )

  const handleToggleCategory = useCallback((category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        disableEnforceFocus
        disableRestoreFocus
        slotProps={{
          backdrop: {
            css: css({ backgroundColor: "transparent" }),
          },
        }}
        PaperProps={{
          css: css({
            maxHeight: "70vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }),
        }}
        css={css({
          "& .MuiDialog-container": {
            alignItems: "flex-start",
            paddingTop: "48px",
          },
        })}
      >
        <DialogTitle
          css={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 0,
            flexShrink: 0,
          })}
        >
          Add Node
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>

        <div
          css={css({
            display: "flex",
            flexDirection: "row",
            flexGrow: 1,
            minHeight: 0,
            overflow: "hidden",
          })}
        >
          <NodeListPanel
            entries={filteredEntries}
            searchText={searchText}
            onSearchChange={setSearchText}
            selectedKey={selectedKey}
            onSelect={entry => setSelectedKey(entry.key)}
            onAdd={handleAddNode}
            collapsedCategories={collapsedCategories}
            onToggleCategory={handleToggleCategory}
            onKeyDown={handleKeyDown}
          />
          <NodeDetailPanel entry={selectedEntry} onAdd={handleAddNode} />
        </div>
      </Dialog>

      <PortAddDialog
        open={portAddDialogState.open}
        portType={portAddDialogState.portType}
        graphEndpoint={graphEndpoint}
        onClose={() => {
          setPortAddDialogState(prev => ({ ...prev, open: false }))
        }}
        onPortAdd={node => {
          onNodeAddRef.current(node)
          onClose()
        }}
        existingPortNames={
          portAddDialogState.portType === "input"
            ? existingInputPortNames
            : existingOutputPortNames
        }
      />
    </>
  )
}
