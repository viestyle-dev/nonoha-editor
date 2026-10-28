"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useReactFlow,
  useHandleConnections,
  useNodesData,
} from "@xyflow/react"
import {
  Button,
  Collapse,
  Divider,
  Paper,
  TextField,
  Typography,
} from "@mui/material"
import { css } from "@emotion/react"
import {
  GraphEndpoint,
  PortData,
  PortDataType,
  PortValue,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { useThemeStore } from "@/src/stores/theme-store"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { NodeHandleLeft } from "@/src/components/node-handle"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { ExpandLess, ExpandMore } from "@mui/icons-material"
import { SignalLamp } from "@/src/components/signal-lamp"

const BytesDisplay = memo(
  (props: {
    graphEndpoint: GraphEndpoint | undefined
    targetIndex: number
    bytesPerRow: number
  }) => {
    const { graphEndpoint, targetIndex, bytesPerRow } = props

    const refTargetIndex = useRef(targetIndex)
    refTargetIndex.current = targetIndex

    const refBytesPerRow = useRef(bytesPerRow)
    refBytesPerRow.current = bytesPerRow

    // Handle connections
    const valuesConns = useHandleConnections({ type: "target", id: "values" })
    const valuesSourceData = useNodesData<BasicPortNode>(valuesConns[0]?.source)
    const valuesSourceDataRef = useRef(valuesSourceData)
    valuesSourceDataRef.current = valuesSourceData

    const [errorMessage, setErrorMessage] = useState<string | undefined>(
      undefined
    )
    const [binaryRows, setBinaryRows] = useState<
      Array<{ offset: string; data: string }>
    >([])
    const refCurrentPortValues = useRef<PortValue[] | undefined>(undefined)

    const [triggerCount, setTriggerCount] = useState(0)

    // Convert byte to binary string (8 bits)
    const byteToBinary = useCallback((byte: number): string => {
      return byte.toString(2).padStart(8, "0")
    }, [])

    // Update display with new data
    const updateDisplay = useCallback(
      (portValues: PortValue[]) => {
        const portValue = portValues[refTargetIndex.current]
        if (portValue === undefined) {
          setErrorMessage(
            `Target index out of range: port value count is ${portValues.length}`
          )
          setBinaryRows([])
          return
        }

        // Validate data type - only uint8 allowed
        if (portValue.dataType !== PortDataType.Uint8) {
          setErrorMessage("Only uint8 data type is supported")
          setBinaryRows([])
          return
        }

        // Validate shape - must be 2D (batch, data)
        if (portValue.shape.length !== 2) {
          setErrorMessage("Expected 2D array (batch, data)")
          setBinaryRows([])
          return
        }

        setErrorMessage(undefined)

        // Get the last batch item
        const batchSize = portValue.shape[0]
        const dataLength = portValue.shape[1]
        const uint8Array = portValue.array as Uint8Array

        // Calculate the start index for the last batch item
        const lastItemStartIndex = (batchSize - 1) * dataLength

        // Convert bytes to binary strings with row formatting
        const rows: Array<{ offset: string; data: string }> = []
        const bytesPerRow = refBytesPerRow.current

        for (let i = 0; i < dataLength; i += bytesPerRow) {
          const rowBytes = []
          for (let j = 0; j < bytesPerRow && i + j < dataLength; j++) {
            // Access data directly from original array with offset
            rowBytes.push(byteToBinary(uint8Array[lastItemStartIndex + i + j]))
          }
          // Pad last row to maintain alignment
          while (rowBytes.length < bytesPerRow) {
            rowBytes.push("        ") // 8 spaces for empty slot
          }
          // Add offset label (decimal notation)
          const offsetLabel = i.toString().padStart(5, " ")
          rows.push({ offset: offsetLabel, data: rowBytes.join(" ") })
        }

        setBinaryRows(rows)
      },
      [byteToBinary]
    )

    // Update when targetIndex or bytesPerRow changes
    useEffect(() => {
      if (refCurrentPortValues.current === undefined) {
        return
      }
      updateDisplay(refCurrentPortValues.current)
      setTriggerCount(prev => prev + 1)
    }, [targetIndex, bytesPerRow, updateDisplay])

    // Fetch initial data
    useEffect(() => {
      const portName = valuesSourceData?.data.port.name
      if (!graphEndpoint || !portName) {
        return
      }

      graphEndpoint.fetchOutputValues(portName)
        .then(values => {
          refCurrentPortValues.current = values
          updateDisplay(values)
        })
        .catch(error => {
          console.error(error)
        })
    }, [valuesSourceData, graphEndpoint, updateDisplay])

    // Subscribe to output updates
    useEffect(() => {
      if (!graphEndpoint) {
        return
      }

      const onOutputCallback = (output: PortData) => {
        if (valuesSourceDataRef.current?.data.port.name !== output.portName) {
          return
        }
        refCurrentPortValues.current = output.values
        updateDisplay(output.values)
      }

      graphEndpoint.addOutputCallback(onOutputCallback)
      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint, updateDisplay])

    const [{ colors }] = useThemeStore()

    return (
      <>
        <div
          css={css({
            paddingLeft: 8,
          })}
        >
          <SignalLamp triggerCount={triggerCount} />
        </div>
        {errorMessage && (
          <Typography
            variant="caption"
            css={css({
              color: colors.error,
              padding: "0 8px 8px 8px",
              display: "block",
            })}
          >
            {errorMessage}
          </Typography>
        )}
        <div
          css={css({
            padding: "0 8px 8px 8px",
            fontFamily: "monospace",
            fontSize: "11px",
            lineHeight: "14px",
            // color: onSurfaceVariantColor,
            // height: "300px",
            overflowY: "auto",
            overflowX: "hidden",
            userSelect: "text",
            cursor: "text",
          })}
        >
          {binaryRows.length > 0 ? (
            binaryRows.map((row, index) => (
              <div key={index} css={css({ display: "flex", gap: "8px" })}>
                <span
                  css={css({
                    color: colors.onSurfaceVariant,
                    minWidth: "48px",
                    textAlign: "right",
                  })}
                >
                  {row.offset}:
                </span>
                <span>{row.data}</span>
              </div>
            ))
          ) : (
            <Typography variant="caption" color="textSecondary">
              No data
            </Typography>
          )}
        </div>
      </>
    )
  }
)

export type BytesDisplayNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    targetIndex?: number
    bytesPerRow?: number
  }
}>

export const BytesDisplayNode = memo((props: NodeProps<BytesDisplayNode>) => {
  const { setNodes } = useReactFlow()
  const [{ colors }] = useThemeStore()

  const targetIndex = props.data.nodeData?.targetIndex ?? 0
  const bytesPerRow = props.data.nodeData?.bytesPerRow ?? 8

  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<BytesDisplayNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as BytesDisplayNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
    },
    [props.id, setNodes]
  )

  const editorModelUpdater = props.data.editorModelUpdater

  // Initial data is now passed via props.data from page.tsx
  // No need to fetch from backend

  const applyNodeData = (targetIndex: number, bytesPerRow: number) => {
    updateNodeData({ targetIndex, bytesPerRow })
    const nodeId = props.id

    editorModelUpdater.patchNodeData(nodeId, {
      targetIndex,
      bytesPerRow,
    })
  }

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false)

  return (
    <Paper
      css={css({
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        color: colors.onSurface,
        background: colors.surfaceContainerHighest,
        outlineOffset: "4px",
        minWidth: "240px",
      })}
      style={{
        outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
      }}
    >
      <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />
      <div
        className={titleEditing ? "" : "drag-handle"}
        css={css({
          width: "100%",
          padding: 8,
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
        css={css`
          display: flex;
          flex-direction: row;
        `}
      >
        <div
          css={css`
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          `}
        >
          <NodeHandleLeft id="values" label="values" />
        </div>
        <div
          css={css`
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            padding: 8px;
            min-width: 200px;
          `}
        />
      </div>

      <BytesDisplay
        graphEndpoint={props.data.graphEndpoint}
        targetIndex={targetIndex}
        bytesPerRow={bytesPerRow}
      />

      <Button
        css={css({
          height: 16,
          color: colors.onSurfaceVariant,
        })}
        size="small"
        onClick={() => {
          setDetailsOpen(!detailsOpen)
        }}
      >
        {detailsOpen ? <ExpandLess /> : <ExpandMore />}
      </Button>
      <Collapse in={detailsOpen}>
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            padding: "8px",
            gap: "8px",
          })}
        >
          <TextField
            label="Target Index"
            type="number"
            size="small"
            value={targetIndex}
            onChange={event => {
              const value = parseInt(event.target.value)
              if (!isNaN(value) && value >= 0) {
                updateNodeData({ targetIndex: value })
              }
            }}
            onBlur={() => {
              applyNodeData(targetIndex, bytesPerRow)
            }}
            inputProps={{ min: 0 }}
          />
          <TextField
            label="Bytes Per Row"
            type="number"
            size="small"
            value={bytesPerRow}
            onChange={event => {
              const value = parseInt(event.target.value)
              if (!isNaN(value) && value > 0 && value <= 32) {
                updateNodeData({ bytesPerRow: value })
              }
            }}
            onBlur={() => {
              applyNodeData(targetIndex, bytesPerRow)
            }}
            inputProps={{ min: 1, max: 32 }}
          />
        </div>
      </Collapse>
    </Paper>
  )
})
