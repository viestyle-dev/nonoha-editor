"use client"
import {
  Node,
  NodeProps,
  useReactFlow,
  NodeResizeControl,
  ResizeParams,
  ResizeDragEvent,
} from "@xyflow/react"
import { GraphEndpoint } from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { memo, useCallback } from "react"
import { useThemeStore } from "@/src/stores/theme-store"
import { css } from "@emotion/react"
import { enqueueSnackbar } from "notistack"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"

export type CommentNode = Node<{
  graphEndpoint: GraphEndpoint
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    comment?: string
  }
}>

export const CommentNode = memo((props: NodeProps<CommentNode>) => {
  const [{ colors }] = useThemeStore()

  // Use node.data.nodeData.comment as the source of truth
  const comment = props.data.nodeData?.comment || ""

  const { setNodes } = useReactFlow()

  const editorModelUpdater = props.data.editorModelUpdater

  // Helper function to update nodeData (persisted settings)
  const updateNodeData = useCallback(
    (newNodeData: Partial<NonNullable<CommentNode["data"]["nodeData"]>>) => {
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as CommentNode["data"]).nodeData, ...newNodeData },
                },
              }
            : node
        )
      )
    },
    [props.id, setNodes]
  )

  const onResizeEnd = useCallback(
    (_event: ResizeDragEvent, params: ResizeParams) => {
      editorModelUpdater.updateNodeSize(props.id, params.width, params.height)
    },
    [editorModelUpdater, props.id]
  )

  const publishComment = async (newComment: string) => {
    // Update node.data first (immediate UI update)
    updateNodeData({ comment: newComment })

    // Then sync with API
    const nodeId = props.id
    const editorModelUrl = editorModelUpdater.editorModelUrl

    try {
      const response = await fetch(
        `${editorModelUrl}?query=nodes.${nodeId}.data`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            comment: newComment,
          }),
        }
      )
      if (!response.ok) {
        const error = await response.text()
        console.error(error)
        enqueueSnackbar(error, { variant: "error" })
        // Revert on API error
        updateNodeData({ comment: props.data.nodeData?.comment })
        return
      }
    } catch (error) {
      console.error('Failed to save comment:', error)
      enqueueSnackbar('Failed to save comment', { variant: "error" })
      // Revert on network error
      updateNodeData({ comment: props.data.nodeData?.comment })
    }
  }

  return (
    <div
      css={css({
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        outlineOffset: "4px",
        border: `1px solid ${colors.outlineVariant}`,
        pointerEvents: "none",
      })}
      style={{
        outline: props.selected ? `2px solid ${colors.tertiary}` : "none",
      }}
    >
      <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />
      {props.selected && (
        <NodeResizeControl
          minWidth={100}
          minHeight={30}
          position="bottom-right"
          onResizeEnd={onResizeEnd}
          style={{
            background: "transparent",
            border: "none",
            pointerEvents: "auto",
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
        className="drag-handle"
        style={{
          width: "100%",
          height: "8px",
          cursor: "move",
          backgroundColor: colors.outlineVariant,
          borderRadius: "11px 11px 0 0",
          pointerEvents: "auto",
        }}
      />
      <div
        css={css({
          display: "grid",
          alignSelf: "flex-start",
          maxWidth: "100%",
          maxHeight: "100%",
          minWidth: "3em",
          minHeight: 0,
          overflow: "hidden",
        })}
      >
        <div
          aria-hidden
          css={css({
            gridArea: "1 / 1",
            visibility: "hidden",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: "8px",
            fontSize: "0.875rem",
            font: "inherit",
          })}
        >
          {(comment || " ") + "\n "}
        </div>
        <textarea
          css={css({
            gridArea: "1 / 1",
            backgroundColor: "transparent",
            font: "inherit",
            color: colors.onSurface,
            width: "100%",
            height: "100%",
            border: "none",
            resize: "none",
            outline: "none",
            padding: "8px",
            fontSize: "0.875rem",
            pointerEvents: "auto",
          })}
          value={comment}
          onBlur={(event) => {
            publishComment(event.target.value)
          }}
          onChange={event => {
            // Update node.data immediately for responsive UI
            updateNodeData({ comment: event.target.value })
          }}
        />
      </div>
    </div>
  )
})
