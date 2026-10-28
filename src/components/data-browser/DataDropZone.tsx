import { memo, useCallback, useRef, useState } from "react"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"
import CloudUploadIcon from "@mui/icons-material/CloudUpload"
import { Typography } from "@mui/material"

export interface DataDropZoneProps {
  children: React.ReactNode
  onDrop: (files: File[]) => void
  disabled?: boolean
}

export const DataDropZone = memo((props: DataDropZoneProps) => {
  const { children, onDrop, disabled } = props
  const [{ colors }] = useThemeStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const counterRef = useRef(0)

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return
      e.preventDefault()
      counterRef.current++
      if (counterRef.current === 1) setIsDragOver(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counterRef.current--
    if (counterRef.current === 0) setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      counterRef.current = 0
      setIsDragOver(false)
      if (disabled) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onDrop(files)
    },
    [disabled, onDrop],
  )

  return (
    <div
      css={css({ position: "relative", height: "100%", minHeight: 0 })}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragOver && (
        <div
          css={css({
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: `${colors.primary}14`,
            border: `2px dashed ${colors.primary}`,
            borderRadius: 8,
            zIndex: 10,
            pointerEvents: "none",
          })}
        >
          <CloudUploadIcon
            css={css({ fontSize: 48, color: colors.primary, opacity: 0.7 })}
          />
          <Typography
            variant="body2"
            css={css({ color: colors.primary, fontWeight: 500 })}
          >
            Drop files here
          </Typography>
        </div>
      )}
    </div>
  )
})
