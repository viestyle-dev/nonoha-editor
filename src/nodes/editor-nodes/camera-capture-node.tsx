import { memo, useCallback, useEffect, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  useHandleConnections,
  useNodesData,
} from "@xyflow/react"
import {
  Button,
  Divider,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Typography,
  Slider,
} from "@mui/material"
import { css } from "@emotion/react"
import {
  PortDataType,
  GraphEndpoint,
  PortData,
} from "nonoha-client-js"
import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { BasicPortNode } from "@/src/nodes/engine-nodes/basic-port-node"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleRight } from "@/src/components/node-handle"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"

export type CameraCaptureNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
}>

type Mode = "one-shot" | "streaming"

export const CameraCaptureNode = memo((props: NodeProps<CameraCaptureNode>) => {
  const [{ colors }] = useThemeStore()

  // ---
  const imageConns = useHandleConnections({
    type: "source",
    id: "image",
  })
  const imageTargetsData = useNodesData<BasicPortNode>(
    imageConns.map(conn => conn.target)
  )
  const refImageTargetsData = useRef(imageTargetsData)
  refImageTargetsData.current = imageTargetsData

  // ---

  const [mode, setMode] = useState<Mode>("one-shot")
  const [streaming, setStreaming] = useState(false)
  const [frequency, setFrequency] = useState(2) // Hz
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // カメラ起動
  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(stream => {
        if (cancelled) return
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(e => {
        setError("カメラにアクセスできません: " + e)
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  // ストリーミング制御
  useEffect(() => {
    if (mode !== "streaming" || !streaming) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    intervalRef.current = setInterval(() => {
      handleCapture()
    }, 1000 / frequency)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, streaming, frequency])

  // 画像データ送信
  const handleCapture = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth
    const h = video.videoHeight
    if (w === 0 || h === 0) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)
    // RGBA -> RGB (Uint8Array)
    const rgb = new Uint8Array(w * h * 3)
    for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
      rgb[j] = imageData.data[i]
      rgb[j + 1] = imageData.data[i + 1]
      rgb[j + 2] = imageData.data[i + 2]
    }

    // 送信
    const graphEndpoint = props.data.graphEndpoint
    if (!graphEndpoint) {
      return
    }
    const portData: PortData = {
      portName: "",
      values: [
        {
          dataType: PortDataType.Uint8,
          shape: [1, h, w, 3],
          array: rgb,
        },
      ],
    }
    refImageTargetsData.current.forEach(target => {
      const portName = target.data.port.name
      portData.portName = portName
      graphEndpoint.dispatchInput(portData)
    })
  }, [props.data.graphEndpoint])

  // UI
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
      <div className="drag-handle" css={css({ width: "100%", padding: 8 })}>
        <EditableTypography
          editing={false}
          onEditingChange={() => {}}
          text={props.data.label || "Camera Capture"}
          fontSize={16}
        />
      </div>
      <Divider />
      <div
        css={css({
          display: "flex",
          flexDirection: "row",
        })}
      >
        <div css={css({ flexGrow: 1 })} />
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          })}
        >
          <NodeHandleRight id="image" label="image" />
        </div>
      </div>
      <div
        css={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: 8,
        })}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: 160,
            height: 120,
            background: "#222",
            borderRadius: 4,
          }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v) => v && setMode(v)}
          sx={{ mt: 1, mb: 1 }}
          size="small"
        >
          <ToggleButton value="one-shot">One Shot</ToggleButton>
          <ToggleButton value="streaming">Streaming</ToggleButton>
        </ToggleButtonGroup>
        {mode === "one-shot" && (
          <Button
            variant="contained"
            size="small"
            onClick={handleCapture}
            sx={{ mt: 1 }}
          >
            Capture
          </Button>
        )}
        {mode === "streaming" && (
          <>
            <div style={{ width: 120, marginTop: 8 }}>
              <Typography variant="caption">
                Frequency: {frequency} Hz
              </Typography>
              <Slider
                min={1}
                max={30}
                value={frequency}
                onChange={(_, v) => setFrequency(Number(v))}
                step={1}
                size="small"
              />
            </div>
            <Button
              variant={streaming ? "outlined" : "contained"}
              size="small"
              onClick={() => setStreaming(s => !s)}
              sx={{ mt: 1 }}
            >
              {streaming ? "Stop" : "Start"}
            </Button>
          </>
        )}
        {error && (
          <Typography color="error" variant="caption" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </div>
    </Paper>
  )
})
