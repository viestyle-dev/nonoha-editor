"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
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
import { enqueueSnackbar } from "notistack"

const LabelDisplay = memo(
  (props: {
    graphEndpoint: GraphEndpoint | undefined
    targetIndex: number
    mapper: { [key: number]: string }
  }) => {
    const { graphEndpoint, targetIndex, mapper } = props

    const refTargetIndex = useRef(targetIndex)
    refTargetIndex.current = targetIndex

    const refMapper = useRef(mapper)
    refMapper.current = mapper

    // ---
    const valuesConns = useHandleConnections({ type: "target", id: "values" })
    const valuesSourceData = useNodesData<BasicPortNode>(valuesConns[0]?.source)
    const valuesSourceDataRef = useRef(valuesSourceData)
    valuesSourceDataRef.current = valuesSourceData
    // ---

    const [errorMessage, setErrorMessage] = useState<string | undefined>(
      undefined
    )
    const refCurrentPortValues = useRef<PortValue[] | undefined>(undefined)
    const [label, setLabel] = useState<string | undefined>(undefined)

    const updateLabel = (portValues: PortValue[]) => {
      const portValue = portValues[refTargetIndex.current]
      if (portValue === undefined) {
        setErrorMessage(
          `Target index out of range: port value count is ${portValues.length}`
        )
        return
      }

      if (portValue.shape.length !== 1) {
        setErrorMessage("shape must be 1D")
        return
      }

      const lastValue = (() => {
        switch (portValue.dataType) {
          case PortDataType.Int8:
          case PortDataType.Uint8:
          case PortDataType.Int32:
          case PortDataType.Uint32:
          case PortDataType.Bool:
            return portValue.array[portValue.array.length - 1]
        }
        return undefined
      })()
      if (lastValue === undefined) {
        setErrorMessage("Unsupported data type")
        return
      }

      setErrorMessage(undefined)
      const label = refMapper.current[lastValue]
      if (label === undefined) {
        setLabel(`${lastValue}`)
        return
      }
      setLabel(`${lastValue}: ${label}`)
    }

    useEffect(() => {
      if (refCurrentPortValues.current === undefined) {
        return
      }
      updateLabel(refCurrentPortValues.current)
    }, [mapper, targetIndex])

    useEffect(() => {
      const portName = valuesSourceData?.data.port.name
      if (!graphEndpoint || !portName) {
        return
      }

      graphEndpoint.fetchOutputValues(portName)
        .then(values => {
          refCurrentPortValues.current = values
          updateLabel(values)
        })
        .catch(error => {
          console.error(error)
        })
    }, [valuesSourceData, graphEndpoint])

    useEffect(() => {
      if (!graphEndpoint) {
        return
      }

      const onOutputCallback = (output: PortData) => {
        if (valuesSourceDataRef.current?.data.port.name !== output.portName) {
          return
        }
        refCurrentPortValues.current = output.values
        updateLabel(output.values)
      }

      graphEndpoint.addOutputCallback(onOutputCallback)

      return () => {
        graphEndpoint.removeOutputCallback(onOutputCallback)
      }
    }, [graphEndpoint])

    return (
      <Typography
        variant={errorMessage !== undefined ? "caption" : "h6"}
        color={errorMessage !== undefined ? "error" : "inherit"}
      >
        {errorMessage !== undefined ? errorMessage : label}
      </Typography>
    )
  }
)

export type LabeledNumberDisplayNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    targetIndex?: number
    mapper?: string
  }
}>

export const LabeledNumberDisplayNode = memo(
  (props: NodeProps<LabeledNumberDisplayNode>) => {
    const { setNodes } = useReactFlow()
    const [{ colors }] = useThemeStore()

    const editorModelUpdater = props.data.editorModelUpdater
    const graphEndpoint = props.data.graphEndpoint
    const [detailsOpen, setDetailsOpen] = useState(false)

    const targetIndex = props.data.nodeData?.targetIndex ?? 0
    const inputMapper = props.data.nodeData?.mapper ?? ""
    const [mapper, setMapper] = useState<{ [key: number]: string }>({})

    const updateNodeData = useCallback((newNodeData: Partial<NonNullable<LabeledNumberDisplayNode['data']['nodeData']>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as LabeledNumberDisplayNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
    }, [props.id, setNodes])

    const [titleEditing, setTitleEditing] = useState(false)

    useEffect(() => {
      // Parse mapper when inputMapper changes
      if (inputMapper) {
        try {
          const mapper = JSON.parse(inputMapper)
          setMapper(mapper)
        } catch (error) {
          console.error(error)
        }
      } else {
        setMapper({})
      }
    }, [inputMapper])

    // Initial data is now passed via props.data from page.tsx
    // No need to fetch from backend

    const saveTargetIndex = async (targetIndex: number) => {
      updateNodeData({ targetIndex })
      const nodeId = props.id
      const editorModelUrl = editorModelUpdater.editorModelUrl

      fetch(`${editorModelUrl}?query=nodes.${nodeId}.data`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetIndex: targetIndex,
        }),
      })
        .then(response => response.json())
        .then(data => {
          console.log(data)
        })
    }

    const saveMapper = async (mapperString: string) => {
      updateNodeData({ mapper: mapperString })
      const nodeId = props.id
      const editorModelUrl = editorModelUpdater.editorModelUrl

      fetch(`${editorModelUrl}?query=nodes.${nodeId}.data`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mapper: mapperString,
        }),
      })
        .then(response => response.json())
        .then(data => {
          console.log(data)
        })
    }

    return (
      <Paper
        sx={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          background: colors.surfaceContainerHighest,
          color: colors.onSurface,
          outlineOffset: "4px",
        }}
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
            // backgroundColor: surfaceContainerHighColor,
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
            `}
          >
            <NodeHandleLeft id="values" label="values" />
          </div>
          <div css={css({ flexGrow: 1 })} />
        </div>
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            paddingLeft: 8,
            paddingRight: 8,
            paddingBottom: 8,
            maxWidth: 240,
          })}
        >
          <LabelDisplay
            graphEndpoint={graphEndpoint}
            targetIndex={targetIndex}
            mapper={mapper}
          />
        </div>
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
              flexGrow: 1,
              padding: 8,
            })}
          >
            <TextField
              size="small"
              label="Target index"
              type="number"
              value={targetIndex}
              onChange={event => {
                const targetIndex = parseInt(event.target.value)
                saveTargetIndex(targetIndex)
              }}
            />
            <TextField
              css={css({
                marginTop: 8,
              })}
              size="small"
              label="Mapper"
              multiline
              value={inputMapper}
              onChange={event => {
                updateNodeData({ mapper: event.target.value })
              }}
              slotProps={{
                input: {
                  style: {
                    fontSize: "0.75rem",
                  },
                },
              }}
            ></TextField>
            <div
              css={css({
                display: "flex",
                flexDirection: "row",
                marginTop: 8,
                justifyContent: "flex-end",
              })}
            >
              <Button
                onClick={() => {
                  try {
                    const mapper = JSON.parse(inputMapper)
                    setMapper(mapper)
                    saveMapper(inputMapper)
                  } catch (error) {
                    console.error(error)
                    enqueueSnackbar(`Failed to parse JSON: ${error}`, {
                      variant: "error",
                    })
                  }
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </Collapse>
      </Paper>
    )
  }
)
