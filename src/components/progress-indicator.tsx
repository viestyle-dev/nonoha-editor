"use client"

import { useEffect, useState } from "react"
import { Backdrop, CircularProgress } from "@mui/material"

interface ProgressIndicatorProps {
  isActive: boolean
  current: number
  total: number
  message?: string
  startTime: number
  delayMs?: number // default: 300
}

export function ProgressIndicator({
  isActive,
  current,
  total,
  message,
  startTime,
  delayMs = 300,
}: ProgressIndicatorProps) {
  const [showIndicator, setShowIndicator] = useState(false)

  useEffect(() => {
    if (!isActive) {
      // 完了時は即座に非表示
      setShowIndicator(false)
      return
    }

    // 経過時間を計算して残りの遅延を算出
    const elapsed = Date.now() - startTime
    const remainingDelay = Math.max(0, delayMs - elapsed)

    const timer = setTimeout(() => {
      setShowIndicator(true)
    }, remainingDelay)

    return () => clearTimeout(timer)
  }, [isActive, startTime, delayMs])

  if (!isActive) return null

  // 進捗率の計算（totalが0の場合は0%）
  const progressValue = total > 0 ? (current / total) * 100 : 0

  return (
    <>
      {/* 透明な操作ロック要素（即座に表示） */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          cursor: "wait",
        }}
      />

      {/* インジケータ（遅延後にフェードイン） */}
      <Backdrop
        open={showIndicator}
        sx={{
          zIndex: 9999,
          transition: "opacity 150ms ease-in",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            width: 200,
          }}
        >
          {/* CircularProgress with percentage */}
          <div style={{ position: "relative", display: "inline-flex" }}>
            <CircularProgress
              variant="determinate"
              value={progressValue}
              size={48}
              thickness={4}
            />
            {/* <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: "white",
                  fontWeight: 500,
                  fontSize: "0.875rem",
                }}
              >
                {current} / {total}
              </span>
            </div> */}
          </div>

          {/* メッセージ */}
          {message && (
            <span
              style={{
                color: "rgba(255, 255, 255, 0.7)",
                fontSize: "0.75rem",
                textAlign: "center",
              }}
            >
              {message}
            </span>
          )}
        </div>
      </Backdrop>
    </>
  )
}
