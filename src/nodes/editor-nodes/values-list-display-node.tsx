"use client"
import {
  Node,
  NodeProps,
  NodeResizeControl,
  ResizeParams,
  ResizeDragEvent,
} from "@xyflow/react"
import { Paper } from "@mui/material"
import { memo, useCallback, useState } from "react"
import { css } from "@emotion/react"

import {
  GraphEndpoint,
  PortDataType,
  PortValue,
} from "nonoha-client-js"
import { SNAPSHOT_WATCH, useEditorInput } from "@/src/hooks/use-editor-input"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleLeft } from "@/src/components/node-handle"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { SignalLamp } from "@/src/components/signal-lamp"
import { EditorNodeHeader } from "@/src/components/node-header"

/**
 * 多次元配列をシェイプに従って文字列化する高速実装
 */
function formatArrayByShape(array: string[], shape: number[]): string[] {
  if (shape.length === 1) {
    // 1次元配列は単純に文字列化して返す
    return array
  }

  const result: string[] = []
  const firstDimSize = shape[0]
  const restDims = shape.slice(1)
  const subArraySize = restDims.reduce((acc, dim) => acc * dim, 1)

  // 最初の次元をイテレート
  for (let i = 0; i < firstDimSize; i++) {
    const startIdx = i * subArraySize

    if (shape.length === 2) {
      // 2次元配列の処理（最も一般的なケース）
      const row = []
      for (let j = 0; j < shape[1]; j++) {
        row.push(array[startIdx + j])
      }
      result.push(`[${row.join(", ")}]`)
    } else {
      // 3次元以上の配列はサブ配列を再帰的に処理
      const subArray = array.slice(startIdx, startIdx + subArraySize)
      const formattedSubArray = formatMultiDimensional(subArray, restDims)
      result.push(formattedSubArray)
    }
  }

  return result
}

/**
 * 3次元以上の配列を再帰的に処理する補助関数
 */
function formatMultiDimensional(array: string[], shape: number[]): string {
  if (shape.length === 1) {
    return `[${array.join(", ")}]`
  }

  const result = []
  const firstDimSize = shape[0]
  const restDims = shape.slice(1)
  const subArraySize = restDims.reduce((acc, dim) => acc * dim, 1)

  for (let i = 0; i < firstDimSize; i++) {
    const startIdx = i * subArraySize
    const subArray = array.slice(startIdx, startIdx + subArraySize)
    result.push(formatMultiDimensional(subArray, restDims))
  }

  return `[${result.join(", ")}]`
}

type ValueList = {
  values: string[]
  error: string | undefined
}

const ValuesListDisplay = memo(
  (props: { graphEndpoint: GraphEndpoint | undefined }) => {
    const { graphEndpoint } = props

    const [{ colors }] = useThemeStore()

    const [valueLists, setValueLists] = useState<ValueList[]>([])

    const [triggerCount, setTriggerCount] = useState(0)

    const updateList = (values: PortValue[]): ValueList[] => {
      return values.map((value, index) => {
        const shape = value.shape
        let strings: string[] = []
        // console.log("values", value)

        try {
          // 配列からstring[]に変換
          switch (value.dataType) {
            case PortDataType.Int8:
            case PortDataType.Uint8:
            case PortDataType.Int16:
            case PortDataType.Uint16:
            case PortDataType.Int32:
            case PortDataType.Uint32:
            case PortDataType.Float32:
            case PortDataType.Float64:
              strings = Array.from(value.array, v => v.toString())
              break
            case PortDataType.Int64:
            case PortDataType.Uint64:
              strings = Array.from(value.array, v => v.toString())
              break
            case PortDataType.Bool:
              strings = Array.from(value.array, v => (v ? "true" : "false"))
              break
            case PortDataType.String:
              strings = Array.from(value.array) // 文字列配列は直接使用
              break
            default:
              return {
                values: [],
                error: "Unsupported data type",
              }
          }

          // 期待される要素数とチェック
          const totalElements = shape.reduce((acc, dim) => acc * dim, 1)
          if (strings.length !== totalElements) {
            return {
              values: [],
              error: `Shape mismatch: expected ${totalElements} elements, got ${strings.length}`,
            }
          }

          // 多次元配列の処理
          if (shape.length === 1) {
            return {
              values: strings,
              error: undefined,
            }
          } else {
            const result = formatArrayByShape(strings, shape)
            return {
              values: result,
              error: undefined,
            }
          }
        } catch (error) {
          console.error("Error formatting values:", error)
          return {
            values: [],
            error: `Error formatting values: ${error}`,
          }
        }
      })
    }

    // Solid edge ($output port) or dashed edge (engine node: latest value
    // sampled by the inspector).
    useEditorInput(
      graphEndpoint,
      "values",
      (values: PortValue[]) => {
        const updatedList = updateList(values)
        setValueLists(updatedList)
        setTriggerCount(prev => prev + 1)
      },
      SNAPSHOT_WATCH,
      // The value the port holds now (not counted as a trigger).
      { current: (values: PortValue[]) => setValueLists(updateList(values)) },
    )

    return (
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
        })}
      >
        <div css={css({ flexShrink: 0 })}>
          <SignalLamp triggerCount={triggerCount} />
        </div>
        <div
          css={css({
            display: "flex",
            flexDirection: "row",
            flexGrow: 1,
            overflow: "auto",
            minHeight: 0,
          })}
        >
          {valueLists.map((valueList, index) => (
            <div
              key={index}
              css={css({
                display: "flex",
                flexDirection: "column",
                padding: 8,
                userSelect: "text",
                cursor: "text",
              })}
            >
              {valueList.error ? (
                <div
                  css={css({
                    color: colors.error,
                  })}
                >
                  {valueList.error}
                </div>
              ) : (
                valueList.values.map((value, index) => (
                  <div
                    key={index}
                    css={css({ lineHeight: 1.4, minHeight: "1.4em" })}
                  >
                    {value}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    )
  },
)

export type ValuesListDisplayNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater | undefined
}>

export const ValuesListDisplayNode = memo(
  (props: NodeProps<ValuesListDisplayNode>) => {
    const [{ colors }] = useThemeStore()

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

    return (
      <Paper
        css={css({
          display: "flex",
          flexDirection: "column",
          // overflow: "hidden",
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
        <EditorNodeHeader label={props.data.label} />
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
            padding: 8,
            flexGrow: 1,
            minHeight: 0,
          })}
        >
          <ValuesListDisplay graphEndpoint={props.data.graphEndpoint} />
        </div>
      </Paper>
    )
  },
)
