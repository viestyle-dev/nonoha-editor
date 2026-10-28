"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  NodeResizeControl,
  ResizeDragEvent,
  ResizeParams,
  useHandleConnections,
  useNodesData,
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
import { GraphEndpoint, PortData, PortDataType } from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleLeft } from "@/src/components/node-handle"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"

type DecodeFormat = "rgba" | "jpeg"
type FrameData = { data: Uint8Array; width: number; height: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isChromium = typeof globalThis !== "undefined" && !!(globalThis as Record<string, any>).chrome

/**
 * Cross-browser JPEG decode.
 * Chromium: createImageBitmap(blob) — off-thread decode.
 * Firefox/Safari: img.decode() + createImageBitmap(img) — off-thread decode.
 */
function decodeJpeg(
  jpegData: Uint8Array,
  gen: number,
  decodeGenRef: React.MutableRefObject<number>,
  latestBitmapRef: React.MutableRefObject<ImageBitmap | null>,
  errorRef: React.MutableRefObject<string | undefined>,
) {
  const blob = new Blob([jpegData as BlobPart], { type: "image/jpeg" })

  const onSuccess = (bitmap: ImageBitmap) => {
    if (gen !== decodeGenRef.current) {
      bitmap.close()
      return
    }
    latestBitmapRef.current = bitmap
    errorRef.current = undefined
  }
  const onError = () => {
    if (gen === decodeGenRef.current) errorRef.current = "JPEG decode failed"
  }

  if (isChromium) {
    createImageBitmap(blob).then(onSuccess).catch(onError)
  } else {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    img.decode()
      .then(() => createImageBitmap(img))
      .then(onSuccess)
      .catch(onError)
      .finally(() => URL.revokeObjectURL(url))
  }
}

/**
 * Inner component that handles canvas rendering.
 * Uses refs instead of state to avoid React re-renders on every frame.
 * Error is reported to parent via onError callback (fires only on error state transitions).
 */
const ImageCanvas = memo(
  ({
    graphEndpoint,
    decodeFormat,
    onError,
  }: {
    graphEndpoint: GraphEndpoint | undefined
    decodeFormat: DecodeFormat
    onError?: (error: string | undefined) => void
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const latestFrameRef = useRef<FrameData | null>(null)
    const lastPaintedRef = useRef<FrameData | null>(null)
    const latestBitmapRef = useRef<ImageBitmap | null>(null)
    const decodeGenRef = useRef(0)
    const animFrameRef = useRef<number>(0)
    const errorRef = useRef<string | undefined>(undefined)
    const lastErrorRef = useRef<string | undefined>(undefined)

    const decodeFormatRef = useRef(decodeFormat)
    decodeFormatRef.current = decodeFormat

    const onErrorRef = useRef(onError)
    onErrorRef.current = onError

    const imageConns = useHandleConnections({ type: "target", id: "image" })
    const imageSourceData = useNodesData<BasicPortNode>(imageConns[0]?.source)
    const imageSourceDataRef = useRef(imageSourceData)
    imageSourceDataRef.current = imageSourceData

    useEffect(() => {
      if (!graphEndpoint) return

      const onOutputCallback = (output: PortData) => {
        if (imageSourceDataRef.current?.data.port.name !== output.portName)
          return

        const value = output.values[0]
        if (!value || value.dataType !== PortDataType.Uint8) {
          errorRef.current = "Unsupported data type"
          return
        }

        if (decodeFormatRef.current === "jpeg") {
          decodeGenRef.current++
          decodeJpeg(
            value.array,
            decodeGenRef.current,
            decodeGenRef,
            latestBitmapRef,
            errorRef,
          )
        } else {
          // RGBA path: shape = [batch, H, W, 4]
          if (value.shape.length !== 4 || value.shape[3] !== 4) {
            errorRef.current = "Unsupported RGBA shape"
            return
          }
          errorRef.current = undefined

          const batchCount = value.shape[0]
          const h = value.shape[1]
          const w = value.shape[2]
          const frameSize = h * w * 4
          const lastFrameOffset = (batchCount - 1) * frameSize

          latestFrameRef.current = {
            data: new Uint8Array(
              value.array.buffer,
              value.array.byteOffset + lastFrameOffset,
              frameSize,
            ),
            width: w,
            height: h,
          }
        }
      }

      const paint = () => {
        const canvas = canvasRef.current
        if (!canvas) {
          animFrameRef.current = requestAnimationFrame(paint)
          return
        }

        const bitmap = latestBitmapRef.current
        const frame = latestFrameRef.current

        if (bitmap) {
          // JPEG path
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          const ctx = canvas.getContext("2d")
          if (ctx) ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
          latestBitmapRef.current = null
        } else if (frame && frame !== lastPaintedRef.current) {
          // RGBA path
          lastPaintedRef.current = frame

          if (canvas.width !== frame.width || canvas.height !== frame.height) {
            canvas.width = frame.width
            canvas.height = frame.height
          }

          const ctx = canvas.getContext("2d")
          if (ctx) {
            const rgba = new Uint8ClampedArray(
              frame.data.buffer as ArrayBuffer,
              frame.data.byteOffset,
              frame.data.length,
            )
            ctx.putImageData(
              new ImageData(rgba, frame.width, frame.height),
              0,
              0,
            )
          }
        }

        // Report error to parent only when changed
        if (errorRef.current !== lastErrorRef.current) {
          lastErrorRef.current = errorRef.current
          onErrorRef.current?.(errorRef.current)
        }

        animFrameRef.current = requestAnimationFrame(paint)
      }

      graphEndpoint.addOutputCallback(onOutputCallback)
      animFrameRef.current = requestAnimationFrame(paint)

      return () => {
        cancelAnimationFrame(animFrameRef.current)
        graphEndpoint.removeOutputCallback(onOutputCallback)
        // Invalidate in-flight decodes so completed bitmaps get .close()'d
        decodeGenRef.current++ // eslint-disable-line react-hooks/exhaustive-deps
        const pendingBitmap = latestBitmapRef.current
        if (pendingBitmap) {
          pendingBitmap.close()
          latestBitmapRef.current = null
        }
      }
    }, [graphEndpoint])

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
    decodeFormat?: DecodeFormat
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
    const [decodeFormat, setDecodeFormat] = useState<DecodeFormat>(
      props.data.nodeData?.decodeFormat ?? "rgba",
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
            <FormControl size="small" fullWidth>
              <InputLabel>Format</InputLabel>
              <Select
                value={decodeFormat}
                label="Format"
                onChange={event =>
                  handleFormatChange(event.target.value as DecodeFormat)
                }
              >
                <MenuItem value="rgba">RGBA</MenuItem>
                <MenuItem value="jpeg">JPEG</MenuItem>
              </Select>
            </FormControl>
          </div>
        )}
      </Paper>
    )
  },
)

ImageDisplayNode.displayName = "ImageDisplayNode"
