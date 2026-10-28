import { memo, useCallback, useMemo, useRef, useState } from "react"
import {
  Handle,
  Position,
  Node,
  NodeProps,
  useStore,
  NodeResizeControl,
  ResizeDragEvent,
  ResizeParams,
} from "@xyflow/react"
import { GraphEndpoint } from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { useThemeStore } from "../stores/theme-store"
import { css } from "@emotion/react"
import { IconButton, Typography } from "@mui/material"
import { NodePropertyInputField } from "../components/node-property-input-field"
import { Publish, Replay } from "@mui/icons-material"
import { enqueueSnackbar } from "notistack"

export type GraphNode = Node<{
  label: string
  editorModelUpdater: EditorModelUpdater
  graphEditDisabled: boolean
  graphProperties: {
    [key: string]: string | number | boolean
  }
  graphEndpoint: GraphEndpoint
}>

export const GraphNode = memo((props: NodeProps<GraphNode>) => {
  const [{ colors }] = useThemeStore()

  const graphEditDisabled = props.data.graphEditDisabled
  const graphEndpoint = props.data.graphEndpoint

  const onResizeEnd = useCallback(
    (event: ResizeDragEvent, params: ResizeParams) => {
      console.log(event, params)
      props.data.editorModelUpdater.updateNodeSize(
        props.id,
        params.width,
        params.height,
      )
    },
    [props.data.editorModelUpdater, props.id],
  )

  const [properties, setProperties] = useState(props.data.graphProperties)
  const propertiesInEditRef = useRef(properties)

  const propertyInputs = useMemo(() => {
    return Object.entries(properties).map(([name, value]) => {
      return (
        <NodePropertyInputField
          key={name}
          name={name}
          valueObject={{ value }}
          onChange={v => {
            propertiesInEditRef.current[name] = v
          }}
        />
      )
    })
  }, [properties])

  const publishProperties = async () => {
    const graphName = graphEndpoint.graphName

    console.log(propertiesInEditRef.current)

    const response = await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/properties`,
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
      enqueueSnackbar(error, { variant: "error" })
      return
    }
  }

  const refetchProperties = async () => {
    const graphName = graphEndpoint.graphName

    const response = await fetch(
      `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/properties`,
    )
    if (!response.ok) {
      const error = await response.text()
      enqueueSnackbar(error, { variant: "error" })
      return
    }

    const properties = await response.json()
    setProperties(properties)
    propertiesInEditRef.current = properties
  }

  return (
    <div
      css={css({
        width: "100%",
        height: "100%",
        border: `1px solid ${colors.primary}`,
        // backgroundColor: surfaceColor,
      })}
    >
      {!graphEditDisabled && (
        <NodeResizeControl
          minWidth={100}
          minHeight={30}
          position="bottom-right"
          onResizeEnd={onResizeEnd}
          style={{
            background: "transparent",
            border: "none",
            pointerEvents: "all",
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
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
        })}
      >
        <div
          // className="drag-handle"
          style={{
            width: "100%",
            height: "8px",
            // cursor: "move",
            backgroundColor: colors.primary,
            pointerEvents: "all",
          }}
        />
        <Typography variant="h5" style={{ padding: 8 }}>
          {props.data.label}
        </Typography>
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            pointerEvents: "all",
            width: "100%",
            maxWidth: "320px",
            paddingLeft: 8,
          })}
        >
          <div
            css={css({
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
            })}
          >
            <div css={css({ fontWeight: "bold", fontSize: "12px" })}>
              Properties
            </div>
            {/* <div style={{ flexGrow: 1 }}></div> */}
            <IconButton
              size="small"
              style={{ color: colors.onSurfaceVariant }}
              onClick={refetchProperties}
            >
              <Replay fontSize="inherit"></Replay>
            </IconButton>
            <IconButton
              size="small"
              style={{ color: colors.onSurfaceVariant }}
              onClick={publishProperties}
            >
              <Publish fontSize="inherit" />
            </IconButton>
          </div>
          {propertyInputs.length > 0 ? (
            propertyInputs
          ) : (
            <Typography variant="body2">-</Typography>
          )}
        </div>
      </div>
    </div>
  )
})
