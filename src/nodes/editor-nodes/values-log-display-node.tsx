"use client"
import {
  Node,
  NodeProps,
  NodeResizeControl,
  ResizeParams,
  ResizeDragEvent,
  useHandleConnections,
  useNodesData,
  useReactFlow,
} from "@xyflow/react"
import { Button, Divider, IconButton, Paper, TextField } from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { css } from "@emotion/react"
import { enqueueSnackbar } from "notistack"

import {
  GraphEndpoint,
  PortData,
  PortDataType,
  PortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleLeft } from "@/src/components/node-handle"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { SignalLamp } from "@/src/components/signal-lamp"

function valueToString(value: PortValue): string {
  switch (value.dataType) {
    case PortDataType.String:
      return Array.from(value.array).join(", ")
    case PortDataType.Bool:
      return Array.from(value.array, v => (v ? "true" : "false")).join(", ")
    default:
      return Array.from(value.array as ArrayLike<unknown>, v => String(v)).join(", ")
  }
}

const ValuesLogDisplay = memo(
  (props: {
    graphEndpoint: GraphEndpoint | undefined
    maxEntries: number
  }) => {
    const { graphEndpoint, maxEntries } = props

    const valuesConns = useHandleConnections({
      type: "target",
      id: "values",
    })
    const valuesSourcesData = useNodesData<BasicPortNode>(
      valuesConns[0]?.source,
    )
    const valuesSourcesDataRef = useRef(valuesSourcesData)
    valuesSourcesDataRef.current = valuesSourcesData

    const [{ colors }] = useThemeStore()

    const bufferRef = useRef<string[]>([])
    const entryCountRef = useRef(0)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const autoScrollRef = useRef(true)
    const [renderTrigger, setRenderTrigger] = useState(0)
    const [triggerCount, setTriggerCount] = useState(0)

    // Initial fetch + reconnect reset
    useEffect(() => {
      const portName = valuesSourcesData?.data.port.name
      if (!graphEndpoint || !portName) {
        return
      }

      bufferRef.current = []
      entryCountRef.current = 0

      graphEndpoint
        .fetchOutputValues(portName)
        .then(values => {
          if (values.length > 0) {
            const entry = values.map(v => valueToString(v)).join(" | ")
            bufferRef.current = [entry]
            entryCountRef.current = 1
            setRenderTrigger(prev => prev + 1)
          }
        })
        .catch(error => {
          console.error(error)
        })
    }, [graphEndpoint, valuesSourcesData])

    // Live accumulation
    useEffect(() => {
      if (!graphEndpoint) {
        return
      }

      const onOutputCallback = (output: PortData) => {
        if (
          valuesSourcesDataRef.current?.data.port.name !== output.portName
        ) {
          return
        }

        const entry = output.values.map(v => valueToString(v)).join(" | ")
        bufferRef.current.push(entry)
        entryCountRef.current += 1

        if (bufferRef.current.length > maxEntries) {
          bufferRef.current = bufferRef.current.slice(-maxEntries)
        }

        setTriggerCount(prev => prev + 1)
        setRenderTrigger(prev => prev + 1)
      }

      graphEndpoint.addOutputCallback(onOutputCallback)

      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint, maxEntries])

    // Auto-scroll (only when enabled)
    useEffect(() => {
      if (autoScrollRef.current) {
        const container = scrollContainerRef.current
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      }
    }, [renderTrigger])

    const handleScroll = useCallback(() => {
      const el = scrollContainerRef.current
      if (!el) return
      autoScrollRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 1
    }, [])

    const handleScrollToBottom = useCallback(() => {
      const el = scrollContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
      autoScrollRef.current = true
    }, [])

    const handleClear = useCallback(() => {
      bufferRef.current = []
      entryCountRef.current = 0
      setRenderTrigger(prev => prev + 1)
    }, [])

    const buffer = bufferRef.current
    const startLineNumber = entryCountRef.current - buffer.length + 1

    return (
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        })}
      >
        <div
          css={css({
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            paddingLeft: 4,
            paddingRight: 4,
          })}
        >
          <SignalLamp triggerCount={triggerCount} />
          <div css={css({ flexGrow: 1 })} />
          {!autoScrollRef.current && (
            <IconButton
              size="small"
              onClick={handleScrollToBottom}
              title="Scroll to bottom"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.onSurface}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </IconButton>
          )}
          <IconButton size="small" onClick={handleClear} title="Clear">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.onSurface}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </IconButton>
        </div>
        <div
          ref={scrollContainerRef}
          className="nowheel"
          onScroll={handleScroll}
          css={css({
            overflow: "auto",
            flexGrow: 1,
            minHeight: 0,
            fontFamily: "monospace",
            fontSize: 12,
            padding: "0 4px",
            userSelect: "text",
            cursor: "text",
          })}
        >
          {buffer.map((entry, i) => (
            <div
              key={i}
              css={css({
                lineHeight: 1.4,
                minHeight: "1.4em",
                display: "flex",
              })}
            >
              <span
                css={css({
                  color: colors.onSurface,
                  opacity: 0.4,
                  minWidth: 36,
                  textAlign: "right",
                  marginRight: 8,
                  flexShrink: 0,
                })}
              >
                {startLineNumber + i}
              </span>
              <span>{entry}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
)

export type ValuesLogDisplayNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater | undefined
  nodeData?: {
    maxEntries?: number
  }
}>

export const ValuesLogDisplayNode = memo(
  (props: NodeProps<ValuesLogDisplayNode>) => {
    const { setNodes } = useReactFlow()
    const [{ colors }] = useThemeStore()
    const [titleEditing, setTitleEditing] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)

    const editorModelUpdater = props.data.editorModelUpdater

    const onResizeEnd = useCallback(
      (_event: ResizeDragEvent, params: ResizeParams) => {
        editorModelUpdater?.updateNodeSize(
          props.id,
          params.width,
          params.height,
        )
      },
      [editorModelUpdater, props.id],
    )

    const maxEntries = props.data.nodeData?.maxEntries ?? 500
    const [maxEntriesInput, setMaxEntriesInput] = useState(
      maxEntries.toString(),
    )

    useEffect(() => {
      if (props.data.nodeData?.maxEntries !== undefined) {
        setMaxEntriesInput(props.data.nodeData.maxEntries.toString())
      }
    }, [props.data.nodeData?.maxEntries])

    const updateNodeData = useCallback(
      (
        newNodeData: Partial<
          NonNullable<ValuesLogDisplayNode["data"]["nodeData"]>
        >,
      ) => {
        setNodes(nodes =>
          nodes.map(node =>
            node.id === props.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    nodeData: {
                      ...(node.data as ValuesLogDisplayNode["data"]).nodeData,
                      ...newNodeData,
                    },
                  },
                }
              : node,
          ),
        )
      },
      [props.id, setNodes],
    )

    const applySettings = useCallback(() => {
      const val = Number(maxEntriesInput)
      if (isNaN(val) || val <= 0 || !Number.isInteger(val)) {
        enqueueSnackbar("Invalid Max Entries", { variant: "error" })
        return
      }
      updateNodeData({ maxEntries: val })
      editorModelUpdater?.patchNodeData(props.id, { maxEntries: val })
    }, [maxEntriesInput, updateNodeData, editorModelUpdater, props.id])

    return (
      <Paper
        css={css({
          display: "flex",
          flexDirection: "column",
          overflow: "visible",
          position: "relative",
          width: "100%",
          height: "100%",
          background: colors.surfaceContainerHighest,
          color: colors.onSurface,
          outlineOffset: "4px",
        })}
        style={{
          outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
        }}
      >
        {props.selected && (
          <NodeResizeControl
            minWidth={150}
            minHeight={100}
            position="bottom-right"
            onResizeEnd={onResizeEnd}
            style={{
              background: "transparent",
              border: "none",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke={colors.tertiary}
              fill="none"
              style={{ position: "absolute", right: 2, bottom: 2 }}
            >
              <path d="M21 15L15 21M21 8L8 21" />
            </svg>
          </NodeResizeControl>
        )}
        <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />
        <div
          className={titleEditing ? "" : "drag-handle"}
          css={css({
            width: "100%",
            padding: 8,
            flexShrink: 0,
          })}
        >
          <EditableTypography
            editing={titleEditing}
            onEditingChange={editing => {
              setTitleEditing(editing)
            }}
            text={props.data.label}
            fontSize={14}
          />
        </div>
        <Divider />
        <div
          css={css({
            display: "flex",
            flexDirection: "row",
            overflow: "hidden",
            flexShrink: 0,
          })}
        >
          <div
            css={css({
              display: "flex",
              flexDirection: "column",
            })}
          >
            <NodeHandleLeft id="values" label="values" />
          </div>
          <div css={css({ flexGrow: 1 })} />
        </div>
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            minHeight: 0,
          })}
        >
          <ValuesLogDisplay
            graphEndpoint={props.data.graphEndpoint}
            maxEntries={maxEntries}
          />
        </div>
        {/* Bottom bar with settings toggle */}
        <Divider />
        <div
          css={css({
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 4,
            padding: "0 4px",
            minHeight: 24,
            flexShrink: 0,
          })}
        >
          <IconButton
            size="small"
            onClick={() => setDetailsOpen(!detailsOpen)}
            css={css({
              color: detailsOpen
                ? colors.primary
                : colors.onSurfaceVariant,
              fontSize: 14,
            })}
          >
            <SettingsIcon fontSize="inherit" />
          </IconButton>
        </div>
        {/* Floating settings panel */}
        {detailsOpen && (
          <div
            css={css({
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 10,
              background: colors.surfaceContainer,
              borderRadius: 4,
              boxShadow:
                "0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)",
              padding: 8,
              border: `1px solid ${colors.outlineVariant}`,
            })}
          >
            <div
              css={css({
                display: "flex",
                flexDirection: "column",
                gap: 8,
              })}
            >
              <TextField
                label="Max Entries"
                size="small"
                value={maxEntriesInput}
                onChange={event =>
                  setMaxEntriesInput(event.target.value)
                }
                fullWidth
              />
              <Button
                variant="text"
                size="small"
                onClick={applySettings}
              >
                Apply Settings
              </Button>
            </div>
          </div>
        )}
      </Paper>
    )
  },
)
