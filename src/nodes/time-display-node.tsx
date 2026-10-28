// "use client"
// import {
//   Node,
//   NodeProps,
//   useReactFlow,
//   useHandleConnections,
//   useNodesData,
// } from "@xyflow/react"
// import { Button, Collapse, Divider, Paper, TextField } from "@mui/material"
// import { memo, useEffect, useMemo, useRef, useState } from "react"
// import { css } from "@emotion/react"

// import {
//   EditorModelUpdater,
//   GraphEndpoint,
//   parsePortValuesBytes,
//   PortData,
//   PortDataType,
//   PortValue,
// } from "nonoha-client-js/src/endpoint-store"
// import { useThemeStore } from "../stores/theme-store"
// import {
//   hexFromArgb,
//   MaterialDynamicColors,
// } from "@material/material-color-utilities"
// import { NodeHandleLeft } from "../components/node-handle"
// import { BasicPortNode } from "./basic-port-node"
// import { EditableTypography } from "../components/editable-typography"
// import { BasicNodeToolbar } from "../components/basic-node-toolbar"
// import { ExpandLess, ExpandMore } from "@mui/icons-material"

// const formatTime = (seconds: number): string => {
//   const hours = Math.floor(seconds / 3600)
//   const minutes = Math.floor((seconds % 3600) / 60)
//   const secs = Math.floor(seconds % 60)
//   const millis = Math.floor((seconds % 1) * 1000)

//   return `${hours.toString().padStart(2, "0")}:${minutes
//     .toString()
//     .padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis
//     .toString()
//     .padStart(3, "0")}`
// }

// const TimeDisplay = memo(
//   (props: {
//     graphEndpoint: GraphEndpoint | undefined
//     targetIndex: number
//   }) => {
//     const { graphEndpoint, targetIndex } = props

//     const [themeState] = useThemeStore()
//     const onSurfaceColor = useMemo(() => {
//       return hexFromArgb(
//         MaterialDynamicColors.onSurface.getArgb(themeState.scheme)
//       )
//     }, [themeState.scheme])
//     const errorColor = useMemo(() => {
//       return hexFromArgb(MaterialDynamicColors.error.getArgb(themeState.scheme))
//     }, [themeState.scheme])

//     const refTargetIndex = useRef(targetIndex)
//     refTargetIndex.current = targetIndex

//     // ---
//     const timeConns = useHandleConnections({ type: "target", id: "time" })
//     const timeSourceData = useNodesData<BasicPortNode>(timeConns[0]?.source)
//     const refTimeSourceData = useRef(timeSourceData)
//     refTimeSourceData.current = timeSourceData
//     // ---

//     const [errorMessage, setErrorMessage] = useState<string | undefined>(
//       undefined
//     )
//     const [timeLabel, setTimeLabel] = useState<string | undefined>(undefined)

//     const updateTime = (portValues: PortValue[]) => {
//       const portValue = portValues[refTargetIndex.current]
//       if (portValue === undefined) {
//         setErrorMessage(
//           `Target index out of range: port value count is ${portValues.length}`
//         )
//         return
//       }
//       const lastValue = (() => {
//         switch (portValue.dataType) {
//           case PortDataType.Int32:
//           case PortDataType.Int8:
//           case PortDataType.Uint8:
//           case PortDataType.Float32:
//             return portValue.array[portValue.array.length - 1]
//         }
//         return undefined
//       })()
//       if (lastValue === undefined) {
//         setErrorMessage("Unsupported data type")
//         return
//       }

//       setErrorMessage(undefined)
//       setTimeLabel(formatTime(lastValue))
//     }

//     useEffect(() => {
//       const portName = timeSourceData?.data.port.name
//       if (!graphEndpoint || !portName) {
//         return
//       }
//       const graphName = graphEndpoint.graphName

//       fetch(
//         `http://${graphEndpoint.engineGatewayUrl}/node-flow/graphs/${graphName}/outputs/${portName}/values`
//       )
//         .then(response => response.arrayBuffer())
//         .then(buffer => {
//           if (buffer.byteLength == 0) {
//             return
//           }
//           const dataView = new DataView(buffer)
//           const [values] = parsePortValuesBytes(dataView, 0)
//           updateTime(values)
//         })
//         .catch(error => {
//           console.error(error)
//         })
//     }, [timeSourceData, graphEndpoint])

//     useEffect(() => {
//       if (!graphEndpoint) {
//         return
//       }

//       const onOutputCallback = (output: PortData) => {
//         if (refTimeSourceData.current?.data.port.name !== output.portName) {
//           return
//         }
//         updateTime(output.values)
//       }

//       graphEndpoint.addOutputCallback(onOutputCallback)

//       return () => {
//         graphEndpoint.removeOutputCallback(onOutputCallback)
//       }
//     }, [graphEndpoint])

//     return (
//       <div
//         css={css({
//           width: 240,
//         })}
//       >
//         <div
//           css={css({
//             display: "flex",
//             flexDirection: "row",
//             alignItems: "center",
//           })}
//         >
//           {errorMessage ? (
//             <div
//               css={css({
//                 flexGrow: 1,
//                 color: errorColor,
//                 fontSize: "0.75rem",
//               })}
//             >
//               {errorMessage}
//             </div>
//           ) : (
//             <div
//               css={css({
//                 flexGrow: 1,
//                 color: onSurfaceColor,
//                 fontSize: "1.25rem",
//                 fontWeight: 500,
//               })}
//             >
//               {timeLabel}
//             </div>
//           )}
//         </div>
//       </div>
//     )
//   }
// )

// export type TimeDisplayNode = Node<{
//   label: string
//   graphEndpoint: GraphEndpoint | undefined
//   editorModelUpdater: EditorModelUpdater
// }>

// export const TimeDisplayNode = memo((props: NodeProps<TimeDisplayNode>) => {
//   const [themeState] = useThemeStore()
//   const surfaceContainerHighestColor = hexFromArgb(
//     MaterialDynamicColors.surfaceContainerHighest.getArgb(themeState.scheme)
//   )
//   const surfaceContainerLowColor = hexFromArgb(
//     MaterialDynamicColors.surfaceContainerLow.getArgb(themeState.scheme)
//   )
//   const tertiaryColor = hexFromArgb(
//     MaterialDynamicColors.tertiary.getArgb(themeState.scheme)
//   )
//   const onSurfaceColor = hexFromArgb(
//     MaterialDynamicColors.onSurface.getArgb(themeState.scheme)
//   )
//   const onSurfaceVariantColor = hexFromArgb(
//     MaterialDynamicColors.onSurfaceVariant.getArgb(themeState.scheme)
//   )

//   const { editorModelUpdater, graphEndpoint } = props.data

//   const [detailsOpen, setDetailsOpen] = useState(false)
//   const [titleEditing, setTitleEditing] = useState(false)
//   const [targetIndex, setTargetIndex] = useState(0)

//   const saveTargetIndex = async (targetIndex: number) => {
//     const nodeId = props.id

//     editorModelUpdater.patchNodeData(nodeId, {
//       targetIndex,
//     })
//   }

//   return (
//     <Paper
//       css={css({
//         display: "flex",
//         flexDirection: "column",
//         overflow: "hidden",
//         position: "relative",
//         background: surfaceContainerHighestColor,
//         color: onSurfaceColor,
//         outlineOffset: "4px",
//       })}
//       style={{
//         outline: props.selected ? `1px solid ${tertiaryColor}` : "none",
//       }}
//     >
//       <BasicNodeToolbar nodeId={props.id} isVisible={props.selected} />
//       <div
//         className={titleEditing ? "" : "drag-handle"}
//         css={css({
//           width: "100%",
//           padding: 8,
//           // backgroundColor: surfaceContainerHighColor,
//         })}
//       >
//         <EditableTypography
//           editing={titleEditing}
//           onEditingChange={editing => {
//             setTitleEditing(editing)
//           }}
//           text={props.data.label}
//           fontSize={16}
//         />
//       </div>
//       <Divider />
//       <div
//         css={css({
//           display: "flex",
//           flexDirection: "row",
//         })}
//       >
//         <div
//           css={css({
//             display: "flex",
//             flexDirection: "column",
//           })}
//         >
//           <NodeHandleLeft id="time" label="time" />
//         </div>
//         <div css={css({ flexGrow: 1 })} />
//       </div>
//       <div
//         css={css({
//           display: "flex",
//           flexDirection: "column",
//           padding: 8,
//         })}
//       >
//         <TimeDisplay
//           graphEndpoint={props.data.graphEndpoint}
//           targetIndex={targetIndex}
//         />
//       </div>
//       <Button
//         css={css({
//           height: 16,
//           color: onSurfaceVariantColor,
//         })}
//         size="small"
//         onClick={() => {
//           setDetailsOpen(!detailsOpen)
//         }}
//       >
//         {detailsOpen ? <ExpandLess /> : <ExpandMore />}
//       </Button>
//       <Collapse in={detailsOpen}>
//         <div
//           css={css({
//             display: "flex",
//             flexDirection: "column",
//             flexGrow: 1,
//             padding: 8,
//           })}
//         >
//           <TextField
//             size="small"
//             label="Target index"
//             type="number"
//             value={targetIndex}
//             onChange={event => {
//               const targetIndex = parseInt(event.target.value)
//               setTargetIndex(targetIndex)
//               saveTargetIndex(targetIndex)
//             }}
//           />
//         </div>
//       </Collapse>
//     </Paper>
//   )
// })
