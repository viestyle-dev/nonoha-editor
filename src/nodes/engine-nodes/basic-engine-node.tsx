import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Node, NodeProps, useHandleConnections, useReactFlow } from "@xyflow/react"
import {
  alpha,
  Button,
  Checkbox,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material"
import { css } from "@emotion/react"

import { NodeHandleLeft, NodeHandleRight } from "@/src/components/node-handle"
import { useThemeStore } from "@/src/stores/theme-store"
import { hexFromArgb } from "@material/material-color-utilities"
import {
  Error,
  ExpandLess,
  ExpandMore,
  Link as LinkIcon,
  LinkOff,
  Publish,
  Replay,
} from "@mui/icons-material"
import { GraphEndpoint } from "nonoha-client-js"
import { enqueueSnackbar } from "notistack"
import { NodePropertyInputField } from "@/src/components/node-property-input-field"
import { fetchGraphEdges } from "@/src/stores/node-flow-store"
import { mergeEngineEdges } from "@/src/lib/graph/edge-merge"
import { EditableTypography } from "@/src/components/editable-typography"
import {
  getHctFromPortValueType,
  useNodeFlowColorsStore,
} from "@/src/stores/node-flow-colors-store"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { SnackbarActionClose } from "@/src/components/snackbar-actions"
import { useNodeCatalog } from "@/src/stores/node-catalog-store"

export type BasicEngineNode = Node<{
  label: string
  variant?: "normal" | "compact" | "value"
  nodeData: {
    type: string
    inputs: {
      name: string
      values: {
        type: string
        name: string | null
        dispatch_flag: boolean
      }[]
    }[]
    outputs: {
      name: string
      values: {
        type: string
        name: string | null
      }[]
    }[]
    properties: {
      [key: string]: string | number | boolean
    }
    property_groups?: { keys: string[]; dispatch_flags: boolean[] }[]
  }
  graphEndpoint: GraphEndpoint
}>

/**
 * A single property row that can detect its own connection state via useHandleConnections.
 * When collapsed (detailsOpen=false), only connected rows remain visible.
 */
function PropertyRow({
  portName,
  name,
  value,
  description,
  handleColor,
  detailsOpen,
  groupMode,
  groupChecked,
  onGroupToggle,
  onChange,
  dispatchFlag,
  onDispatchFlagChange,
}: {
  portName: string | null
  name: string
  value: string | number | boolean
  description?: string
  handleColor?: string
  detailsOpen: boolean
  groupMode: boolean
  groupChecked: boolean
  onGroupToggle: (name: string) => void
  onChange: (v: string | number | boolean) => void
  dispatchFlag?: boolean
  onDispatchFlagChange?: (name: string, checked: boolean) => void
}) {
  const connections = useHandleConnections({
    type: "target",
    id: portName ?? undefined,
  })
  const isConnected = portName ? connections.length > 0 : false
  const visible = detailsOpen || isConnected

  return (
    <div
      css={css({ display: visible ? "flex" : "none", alignItems: "center", minHeight: 24 })}
    >
      {groupMode && portName && (
        <Checkbox
          size="small"
          css={css({ padding: 0, marginRight: 4, marginLeft: 4, flexShrink: 0 })}
          checked={groupChecked}
          onChange={() => onGroupToggle(name)}
        />
      )}
      {portName && (
        <NodeHandleLeft
          id={portName}
          handleColor={handleColor}
          size={12}
        />
      )}
      {dispatchFlag !== undefined && onDispatchFlagChange && (
        <Checkbox
          size="small"
          css={css({ padding: 0, flexShrink: 0 })}
          checked={dispatchFlag}
          onChange={e => onDispatchFlagChange(name, e.target.checked)}
        />
      )}
      <div css={css({ flexGrow: 1, minWidth: 0 })}>
        {isConnected ? (
          <Typography
            variant="caption"
            css={css({ paddingLeft: 4, color: "inherit", opacity: 0.7 })}
          >
            {name}
          </Typography>
        ) : (
          <NodePropertyInputField
            name={name}
            description={description}
            valueObject={{ value }}
            onChange={onChange}
          />
        )}
      </div>
    </div>
  )
}

export const BasicEngineNode = memo((props: NodeProps<BasicEngineNode>) => {
  const [{ colors }] = useThemeStore()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const { setEdges, setNodes } = useReactFlow()

  const variant = props.data.variant ?? "normal"
  const minWidth = variant === "normal" ? "176px" : "136px"

  const graphEndpoint = props.data.graphEndpoint

  const [flowColorsState] = useNodeFlowColorsStore()
  const catalogState = useNodeCatalog()
  const catalogEntry = catalogState.entries.get(props.data.nodeData.type)

  // Property editing state tracking
  const [isDirty, setIsDirty] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const inputHandles = useMemo(() => {
    const patchInputPort = async (
      inputName: string,
      values: {
        dispatch_flag: boolean
      }[],
    ) => {
      const graphName = graphEndpoint.graphName
      const nodeName = props.id

      const response = await fetch(
        `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${encodeURIComponent(graphName)}/nodes/${encodeURIComponent(nodeName)}/inputs/${encodeURIComponent(inputName)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values,
          }),
        },
      )

      if (!response.ok) {
        const error = await response.text()
        enqueueSnackbar(error, { variant: "error" })
        return
      }

      setNodes(nodes => {
        return nodes.map(node => {
          if (node.id === props.id) {
            const nodeSelf = node as BasicEngineNode
            return {
              ...node,
              data: {
                ...node.data,
                nodeData: {
                  ...nodeSelf.data.nodeData,
                  inputs: nodeSelf.data.nodeData.inputs.map(input => {
                    if (input.name !== inputName) {
                      return input
                    }
                    return {
                      ...input,
                      values: input.values.map((value, i) => {
                        return {
                          ...value,
                          dispatch_flag: values[i].dispatch_flag,
                        }
                      }),
                    }
                  }),
                },
              },
            }
          }
          return node
        })
      })
    }
    // Filter out @property ports — they are shown in the Properties section
    return props.data.nodeData.inputs.filter(input => !input.name.startsWith("@")).map(input => {
      const valuesString = `[${input.values
        .map(value => value.type)
        .join(", ")}]`
      const firstDataType = input.values[0].type
      const firstDataTypeColor = hexFromArgb(
        getHctFromPortValueType(firstDataType, flowColorsState.pallet).toInt(),
      )
      const catalogPort = catalogEntry?.inputs.find(p => p.name === input.name)
      const tooltipContent = catalogPort?.description
        ? `${catalogPort.description}\n${valuesString}`
        : valuesString

      return (
        <div key={input.name}>
          <Tooltip title={<span style={{ whiteSpace: "pre-line" }}>{tooltipContent}</span>} placement="right">
            <NodeHandleLeft
              id={input.name}
              label={input.name}
              handleColor={firstDataTypeColor}
            />
          </Tooltip>
          {input.values.length > 1 &&
            input.values.map((value, index) => {
              const valueTypeColor = hexFromArgb(
                getHctFromPortValueType(
                  value.type,
                  flowColorsState.pallet,
                ).toInt(),
              )
              return (
                <div
                  key={index}
                  css={css({
                    display: "flex",
                    flexDirection: "row",
                    fontSize: 12,
                    alignItems: "center",
                  })}
                >
                  <Tooltip title={value.type} placement="right">
                    <NodeHandleLeft
                      id={`${input.name}.${index}`}
                      handleColor={valueTypeColor}
                    />
                  </Tooltip>
                  <div
                    css={css({
                      borderLeft: `1px solid ${colors.onSurfaceVariant}`,
                      marginLeft: 4,
                      paddingLeft: 4,
                      alignSelf: "stretch",
                    })}
                  ></div>
                  <div
                    css={css({
                      alignItems: "center",
                    })}
                  >
                    {value.name ? value.name : `${index}`}
                  </div>
                  <Checkbox
                    size="small"
                    css={css({
                      padding: 1,
                    })}
                    checked={value.dispatch_flag}
                    onChange={e => {
                      const valuesToSet = input.values.map((value, i) => {
                        if (i === index) {
                          return {
                            dispatch_flag: e.target.checked,
                          }
                        } else {
                          return {
                            dispatch_flag: value.dispatch_flag,
                          }
                        }
                      })
                      patchInputPort(input.name, valuesToSet)
                    }}
                  />
                </div>
              )
            })}
        </div>
      )
    })
  }, [
    props.data.nodeData.inputs,
    flowColorsState.pallet,
    colors.onSurfaceVariant,
    graphEndpoint,
    props.id,
    setNodes,
    catalogEntry,
  ])

  const outputHandles = useMemo(() => {
    return props.data.nodeData.outputs.map(output => {
      const valuesString = `[${output.values
        .map(value => value.type)
        .join(", ")}]`
      const firstDataType = output.values[0].type
      const firstDataTypeColor = hexFromArgb(
        getHctFromPortValueType(firstDataType, flowColorsState.pallet).toInt(),
      )
      const catalogPort = catalogEntry?.outputs.find(p => p.name === output.name)
      const tooltipContent = catalogPort?.description
        ? `${catalogPort.description}\n${valuesString}`
        : valuesString

      return (
        <div
          key={output.name}
          css={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          })}
        >
          <Tooltip title={<span style={{ whiteSpace: "pre-line" }}>{tooltipContent}</span>} placement="left">
            <NodeHandleRight
              id={output.name}
              label={output.name}
              handleColor={firstDataTypeColor}
            />
          </Tooltip>
          {output.values.length > 1 &&
            output.values.map((value, index) => {
              const valueTypeColor = hexFromArgb(
                getHctFromPortValueType(
                  value.type,
                  flowColorsState.pallet,
                ).toInt(),
              )
              return (
                <div
                  key={index}
                  css={css({
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    fontSize: 12,
                    alignItems: "center",
                  })}
                >
                  <div
                    css={css({
                      alignItems: "center",
                    })}
                  >
                    {value.name ? value.name : `${index}`}
                  </div>
                  <div
                    css={css({
                      borderLeft: `1px solid ${colors.onSurfaceVariant}`,
                      marginLeft: 4,
                      paddingLeft: 4,
                      alignSelf: "stretch",
                    })}
                  />
                  <Tooltip title={value.type} placement="left">
                    <div
                      css={css({
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: valueTypeColor,
                      })}
                    />
                  </Tooltip>
                </div>
              )
            })}
        </div>
      )
    })
  }, [
    props.data.nodeData.outputs,
    flowColorsState.pallet,
    colors.onSurfaceVariant,
    catalogEntry,
  ])

  const [properties, setProperties] = useState(props.data.nodeData.properties)
  const propertiesInEditRef = useRef(properties)

  // Find @property ports for this node
  const propertyPorts = useMemo(() => {
    return props.data.nodeData.inputs.filter(input => input.name.startsWith("@"))
  }, [props.data.nodeData.inputs])

  // Build group lookup: property name → group object
  const propertyGroups = props.data.nodeData.property_groups ?? []
  const groupLookup = useMemo(() => {
    const lookup: Record<string, { keys: string[]; dispatch_flags: boolean[] }> = {}
    for (const group of propertyGroups) {
      for (const key of group.keys) {
        lookup[key] = group
      }
    }
    return lookup
  }, [propertyGroups])

  // Grouping UI state
  const [groupMode, setGroupMode] = useState(false)
  const [groupSelection, setGroupSelection] = useState<Set<string>>(new Set())

  const handleGroupToggle = useCallback((name: string) => {
    setGroupSelection(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const handleCreateGroup = useCallback(async () => {
    const selected = Array.from(groupSelection)
    if (selected.length < 2) return
    const newGroup = { keys: selected, dispatch_flags: selected.map((_, i) => i === selected.length - 1) }
    const newGroups = [...propertyGroups.filter(g => !g.keys.some(k => selected.includes(k))), newGroup]
    const graphName = graphEndpoint.graphName
    await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}/property-groups`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_groups: newGroups }) },
    )
    setGroupMode(false)
    setGroupSelection(new Set())
    // Refetch node to update property_groups
    const resp = await fetch(`http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}`)
    if (resp.ok) {
      const nodeData = await resp.json()
      setNodes(nodes => nodes.map(n => n.id === props.id ? { ...n, data: { ...n.data, nodeData } } : n))
    }
  }, [groupSelection, propertyGroups, graphEndpoint, props.id, setNodes])

  const handleUngroup = useCallback(async (groupToRemove: { keys: string[]; dispatch_flags: boolean[] }) => {
    const newGroups = propertyGroups.filter(g => g.keys.join(",") !== groupToRemove.keys.join(","))
    const graphName = graphEndpoint.graphName
    await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}/property-groups`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_groups: newGroups }) },
    )
    const resp = await fetch(`http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}`)
    if (resp.ok) {
      const nodeData = await resp.json()
      setNodes(nodes => nodes.map(n => n.id === props.id ? { ...n, data: { ...n.data, nodeData } } : n))
    }
  }, [propertyGroups, graphEndpoint, props.id, setNodes])

  const handleDispatchFlagChange = useCallback(async (propName: string, checked: boolean) => {
    // Find the group containing this property and update its dispatch_flags
    const updatedGroups = propertyGroups.map(g => {
      const idx = g.keys.indexOf(propName)
      if (idx === -1) return g
      const newFlags = [...g.dispatch_flags]
      newFlags[idx] = checked
      return { ...g, dispatch_flags: newFlags }
    })
    const graphName = graphEndpoint.graphName
    await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}/property-groups`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_groups: updatedGroups }) },
    )
    const resp = await fetch(`http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}`)
    if (resp.ok) {
      const nodeData = await resp.json()
      setNodes(nodes => nodes.map(n => n.id === props.id ? { ...n, data: { ...n.data, nodeData } } : n))
    }
  }, [propertyGroups, graphEndpoint, props.id, setNodes])

  const makePropertyRow = (name: string, value: string | number | boolean) => {
    const propMeta = catalogEntry?.properties[name]
    const portName = `@${name}`
    const propPort = propertyPorts.find(p => p.name === portName)
    const portType = propPort?.values[0]?.type
    const portColor = portType
      ? hexFromArgb(getHctFromPortValueType(portType, flowColorsState.pallet).toInt())
      : undefined

    // Find dispatch_flag for this property (if in a group)
    const group = groupLookup[name]
    const dispatchFlag = group
      ? group.dispatch_flags[group.keys.indexOf(name)]
      : undefined

    return (
      <PropertyRow
        key={name}
        portName={propPort ? portName : null}
        name={name}
        value={value}
        description={propMeta?.description}
        handleColor={portColor ?? colors.error}
        detailsOpen={detailsOpen}
        groupMode={groupMode}
        groupChecked={groupSelection.has(name)}
        onGroupToggle={handleGroupToggle}
        dispatchFlag={dispatchFlag}
        onDispatchFlagChange={handleDispatchFlagChange}
        onChange={v => {
          propertiesInEditRef.current[name] = v
          setIsDirty(true)
          setValidationError(null)
        }}
      />
    )
  }

  const propertyInputs = useMemo(() => {
    const entries = Object.entries(properties)
    const rendered: React.ReactNode[] = []
    const renderedGroups = new Set<string>()

    for (const [name, value] of entries) {
      const group = groupLookup[name]
      if (group) {
        const groupKey = group.keys.join(",")
        if (renderedGroups.has(groupKey)) continue
        renderedGroups.add(groupKey)
        rendered.push(
          <div
            key={`group:${groupKey}`}
            css={css({
              borderLeft: `2px solid ${colors.outlineVariant}`,
              marginLeft: -4,
              paddingLeft: 8,
              marginTop: 2,
              marginBottom: 2,
              position: "relative",
            })}
          >
            {detailsOpen && (
              <IconButton
                size="small"
                css={css({ position: "absolute", top: -4, left: -14, padding: 0, fontSize: 12 })}
                onClick={() => handleUngroup(group)}
              >
                <LinkOff fontSize="inherit" />
              </IconButton>
            )}
            {group.keys.map((gName: string) => {
              const gValue = properties[gName]
              return gValue !== undefined ? makePropertyRow(gName, gValue) : null
            })}
          </div>
        )
      } else {
        rendered.push(makePropertyRow(name, value))
      }
    }
    return rendered
  }, [properties, catalogEntry, propertyPorts, flowColorsState.pallet, colors.onSurfaceVariant, groupLookup, detailsOpen, groupMode, groupSelection])

  const publishProperties = async () => {
    const graphName = graphEndpoint.graphName

    const response = await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}/properties`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(propertiesInEditRef.current),
      },
    )
    if (!response.ok) {
      const error = await response.text()
      enqueueSnackbar(error, {
        variant: "error",
        persist: true,
        action: SnackbarActionClose,
      })
      // Set validation error but keep the edits
      setValidationError(error)
      setIsDirty(true)
      return
    }

    const graphEdges = await fetchGraphEdges(
      graphEndpoint.engineGatewayUrl,
      graphName,
    )
    const nodeDataResponse = await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}`,
    )
    if (!nodeDataResponse.ok) {
      const error = await nodeDataResponse.text()
      enqueueSnackbar(error, { variant: "error" })
      return
    }
    const nodeData = await nodeDataResponse.json()

    setNodes(nodes => {
      return nodes.map(node => {
        if (node.id === props.id) {
          return {
            ...node,
            data: {
              ...node.data,
              nodeData,
            },
          }
        }
        return node
      })
    })

    setEdges(edges => mergeEngineEdges(edges, graphEdges))

    // Clear dirty and error state on success
    setIsDirty(false)
    setValidationError(null)
  }

  const refetchProperties = async () => {
    const graphName = graphEndpoint.graphName

    const response = await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/nodes/${props.id}/properties`,
    )
    if (!response.ok) {
      const error = await response.text()
      enqueueSnackbar(error, { variant: "error" })
      return
    }

    const properties = await response.json()
    setProperties(properties)

    propertiesInEditRef.current = properties

    // Clear dirty and error state when refetching
    setIsDirty(false)
    setValidationError(null)
  }

  const [titleEditing, setTitleEditing] = useState(false)

  return (
    <Paper
      sx={{
        display: "flex",
        flexDirection: "column",
        background: colors.surfaceContainer,
        color: colors.onSurface,
        minWidth,
        outlineOffset: "4px",
        position: "relative",
      }}
      style={{
        outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
      }}
    >
      <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />
      {/* Status badge outside the node */}
      {(isDirty || validationError) && (
        <div
          css={css({
            position: "absolute",
            top: -6,
            right: -6,
            zIndex: 10,
          })}
        >
          {isDirty && !validationError && (
            <Tooltip title="Unsaved changes" placement="top">
              <div
                css={css({
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: colors.secondary,
                })}
              />
            </Tooltip>
          )}
          {validationError && (
            <Tooltip title={validationError} arrow placement="top">
              <Error sx={{ color: colors.error, fontSize: 16 }} />
            </Tooltip>
          )}
        </div>
      )}
      <Tooltip
        title={
          catalogEntry?.description && !titleEditing
            ? <span style={{ whiteSpace: "pre-line" }}>{`${props.data.nodeData.type}\n${catalogEntry.description}`}</span>
            : ""
        }
        placement="bottom"
        enterDelay={500}
      >
        <div
          className={titleEditing ? "" : "drag-handle"}
          css={css({
            position: "relative",
            height: 32,
            background: validationError
              ? alpha(colors.error, 0.15)
              : isDirty
                ? alpha(colors.secondary, 0.15)
                : "transparent",
            transition: "background 0.2s ease",
            borderRadius: "4px 4px 0 0",
          })}
        >
          <div
            css={css({
              position: "absolute",
              right: 8,
              left: 8,
              top: 0,
              bottom: 0,
              display: "flex",
            })}
          >
            <EditableTypography
              editing={titleEditing}
              onEditingChange={edit => {
                setTitleEditing(edit)
              }}
              text={props.data.label}
              fontSize={14}
            />
          </div>
        </div>
      </Tooltip>
      <Divider />
      <div
        css={{
          marginTop: 4,
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          css={css`
            display: flex;
            flex-direction: column;
          `}
        >
          {inputHandles}
        </div>

        <div css={{ width: 16 }} />

        <div
          css={css`
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          `}
        >
          {outputHandles}
        </div>
      </div>

      {/* Value variant: show "default" property prominently */}
      {variant === "value" && properties["default"] !== undefined && (
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "4px 8px",
          })}
        >
          <Typography
            variant="body1"
            css={css({
              fontWeight: "bold",
              textAlign: "center",
              wordBreak: "break-all",
              width: "100%",
            })}
          >
            {String(properties["default"])}
          </Typography>
        </div>
      )}

      {propertyInputs.length > 0 && (
        <div
          css={{
            display: "flex",
            flexDirection: "column",
            paddingLeft: 8,
            paddingRight: 8,
            paddingBottom: 4,
            overflow: "hidden",
            width: 0,
            minWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          <div
            css={css({
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              width: "100%",
            })}
          >
            <Button
              css={css({
                height: 20,
                color: colors.onSurfaceVariant,
                justifyContent: "flex-start",
                textTransform: "none",
                fontSize: "11px",
                padding: "0 4px",
                flexGrow: 1,
                minWidth: 0,
              })}
              size="small"
              onClick={() => setDetailsOpen(!detailsOpen)}
            >
              {detailsOpen ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
              Properties ({Object.keys(properties).length})
            </Button>
            {detailsOpen && (
              <>
                <IconButton
                  size="small"
                  css={css({ color: colors.onSurfaceVariant, padding: "2px", fontSize: "14px" })}
                  onClick={() => { setGroupMode(!groupMode); setGroupSelection(new Set()) }}
                  title={groupMode ? "Cancel grouping" : "Group properties"}
                >
                  <LinkIcon fontSize="inherit" />
                </IconButton>
                <IconButton
                  size="small"
                  css={css({ color: colors.onSurfaceVariant, padding: "2px", fontSize: "14px" })}
                  onClick={refetchProperties}
                >
                  <Replay fontSize="inherit" />
                </IconButton>
                <IconButton
                  size="small"
                  css={css({ color: colors.onSurfaceVariant, padding: "2px", fontSize: "14px" })}
                  onClick={publishProperties}
                >
                  <Publish fontSize="inherit" />
                </IconButton>
              </>
            )}
          </div>
          {propertyInputs}
          {groupMode && groupSelection.size >= 2 && (
            <Button
              size="small"
              variant="outlined"
              css={css({ fontSize: "10px", marginTop: 4, textTransform: "none" })}
              onClick={handleCreateGroup}
            >
              Group selected ({groupSelection.size})
            </Button>
          )}
        </div>
      )}
    </Paper>
  )
})
