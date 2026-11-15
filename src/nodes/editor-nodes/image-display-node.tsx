"use client"

import { memo, useCallback, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  NodeResizeControl,
  ResizeDragEvent,
  ResizeParams,
  useReactFlow,
} from "@xyflow/react"
import {
  alpha,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tooltip,
} from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import { css } from "@emotion/react"
import { GraphEndpoint } from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { IMAGE_WATCH, useEditorInput } from "@/src/hooks/use-editor-input"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleLeft } from "@/src/components/node-handle"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { useImageFramePainter } from "@/src/hooks/use-image-frame-painter"
import {
  ColorOrder,
  DecodeFormat,
  resolveColorOrder,
  resolveDecodeFormat,
} from "@/src/lib/image-frame"

/**
 * Inner component that handles canvas rendering.
 * Frames are recorded per message and painted at most once per animation
 * frame (see useImageFramePainter); no React re-render per frame.
 * Error is reported to parent via onError callback (fires only on error state transitions).
 */
const ImageCanvas = memo(
  ({
    graphEndpoint,
    decodeFormat,
    colorOrder,
    onError,
  }: {
    graphEndpoint: GraphEndpoint | undefined
    decodeFormat: DecodeFormat
    colorOrder: ColorOrder
    onError?: (error: string | undefined) => void
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const acceptFrame = useImageFramePainter(canvasRef, {
      decodeFormat,
      colorOrder,
      onError,
    })

    // Solid edge ($output port) or dashed edge (engine node via inspector).
    useEditorInput(graphEndpoint, "image", values => acceptFrame(values[0]), IMAGE_WATCH)

    return (
      <div css={css({ position: "relative", flexGrow: 1, minHeight: 0 })}>
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            imageRendering: "auto",
            display: "block",
          }}
        />
      </div>
    )
  },
)

ImageCanvas.displayName = "ImageCanvas"

export type ImageDisplayNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    // "auto" (default) detects raw vs. encoded from the shape; "rgba" (raw
    // pixels) and "jpeg" (encoded bytes) are kept for older saved graphs.
    decodeFormat?: DecodeFormat
    // Channel order of 3/4-channel raw frames ("bgr" for OpenCV output).
    colorOrder?: ColorOrder
  }
}>

export const ImageDisplayNode = memo(
  (props: NodeProps<ImageDisplayNode>) => {
    const [{ colors }] = useThemeStore()
    const [titleEditing, setTitleEditing] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [imageError, setImageError] = useState<string | undefined>()
    const { setNodes } = useReactFlow()

    const editorModelUpdater = props.data.editorModelUpdater
    const [decodeFormat, setDecodeFormat] = useState<DecodeFormat>(() =>
      resolveDecodeFormat(props.data.nodeData?.decodeFormat),
    )
    const [colorOrder, setColorOrder] = useState<ColorOrder>(() =>
      resolveColorOrder(props.data.nodeData?.colorOrder),
    )

    const updateNodeData = useCallback(
      (newNodeData: Partial<NonNullable<ImageDisplayNode["data"]["nodeData"]>>) => {
        setNodes(nodes =>
          nodes.map(node => {
            if (node.id !== props.id) return node
            return {
              ...node,
              data: {
                ...node.data,
                nodeData: {
                  ...(node.data as ImageDisplayNode["data"]).nodeData,
                  ...newNodeData,
                },
              },
            }
          }),
        )
      },
      [props.id, setNodes],
    )

    const handleFormatChange = useCallback(
      (value: DecodeFormat) => {
        setDecodeFormat(value)
        updateNodeData({ decodeFormat: value })
        editorModelUpdater.patchNodeData(props.id, { decodeFormat: value })
      },
      [editorModelUpdater, props.id, updateNodeData],
    )

    const handleColorOrderChange = useCallback(
      (value: ColorOrder) => {
        setColorOrder(value)
        updateNodeData({ colorOrder: value })
        editorModelUpdater.patchNodeData(props.id, { colorOrder: value })
      },
      [editorModelUpdater, props.id, updateNodeData],
    )

    const onResizeEnd = useCallback(
      (_event: ResizeDragEvent, params: ResizeParams) => {
        editorModelUpdater.updateNodeSize(
          props.id,
          params.width,
          params.height,
        )
      },
      [editorModelUpdater, props.id],
    )

    return (
      <Paper
        css={css({
          display: "flex",
          flexDirection: "column",
          overflow: "visible",
          height: "100%",
          position: "relative",
          color: colors.onSurface,
          background: colors.surfaceContainerHighest,
          outlineOffset: "4px",
        })}
        style={{
          outline: props.selected ? `1px solid ${colors.tertiary}` : "none",
        }}
      >
        {/* Main content area */}
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexGrow: 1,
            minHeight: 0,
          })}
        >
          {props.selected && (
            <NodeResizeControl
              minWidth={100}
              minHeight={75}
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
            css={css({ width: "100%", padding: 8 })}
          >
            <EditableTypography
              editing={titleEditing}
              onEditingChange={editing => setTitleEditing(editing)}
              text={props.data.label}
              fontSize={14}
            />
          </div>
          <Divider />
          <div css={css({ display: "flex", flexDirection: "row" })}>
            <div css={css({ display: "flex", flexDirection: "column" })}>
              <NodeHandleLeft id="image" label="image" />
            </div>
            <div css={css({ flexGrow: 1 })} />
          </div>
          <div css={css({ padding: 8, flexGrow: 1, minHeight: 0, overflow: "hidden" })}>
            <ImageCanvas
              graphEndpoint={props.data.graphEndpoint}
              decodeFormat={decodeFormat}
              colorOrder={colorOrder}
              onError={setImageError}
            />
          </div>
        </div>
        {/* Bottom bar with error indicator and settings toggle */}
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
          {imageError && (
            <Tooltip title={imageError} arrow>
              <ErrorOutlineIcon css={css({ fontSize: 14, color: colors.error })} />
            </Tooltip>
          )}
          <IconButton
            size="small"
            onClick={() => setDetailsOpen(!detailsOpen)}
            css={css({
              color: detailsOpen ? colors.primary : colors.onSurfaceVariant,
              fontSize: 14,
            })}
          >
            <SettingsIcon fontSize="inherit" />
          </IconButton>
        </div>
        {/* Overlay settings panel (absolute, outside node bounds) */}
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
              boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)",
              padding: 8,
              border: `1px solid ${colors.outlineVariant}`,
            })}
          >
            {imageError && (
              <div
                css={css({
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 4,
                  padding: "4px 8px",
                  marginBottom: 8,
                  fontSize: 12,
                  color: colors.error,
                  background: alpha(colors.error, 0.08),
                  borderRadius: 4,
                  border: `1px solid ${alpha(colors.error, 0.2)}`,
                })}
              >
                <ErrorOutlineIcon css={css({ fontSize: 14, flexShrink: 0, marginTop: 1 })} />
                <span css={css({ whiteSpace: "pre-wrap", wordBreak: "break-word" })}>
                  {imageError}
                </span>
              </div>
            )}
            <div css={css({ display: "flex", flexDirection: "column", gap: 8 })}>
              <FormControl size="small" fullWidth>
                <InputLabel>Format</InputLabel>
                <Select
                  value={decodeFormat}
                  label="Format"
                  onChange={event =>
                    handleFormatChange(event.target.value as DecodeFormat)
                  }
                >
                  <MenuItem value="auto">Auto</MenuItem>
                  <MenuItem value="rgba">Raw pixels (Gray/RGB/RGBA)</MenuItem>
                  <MenuItem value="jpeg">Encoded (JPEG/PNG/WebP)</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Color Order</InputLabel>
                <Select
                  value={colorOrder}
                  label="Color Order"
                  onChange={event =>
                    handleColorOrderChange(event.target.value as ColorOrder)
                  }
                >
                  <MenuItem value="rgb">RGB</MenuItem>
                  <MenuItem value="bgr">BGR (OpenCV)</MenuItem>
                </Select>
              </FormControl>
            </div>
          </div>
        )}
      </Paper>
    )
  },
)

ImageDisplayNode.displayName = "ImageDisplayNode"
