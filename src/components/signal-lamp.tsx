"use client"

import { memo, useEffect, useMemo, useRef } from "react"
import { css } from "@emotion/react"

import { useThemeStore } from "../stores/theme-store"

interface SignalLampProps {
  triggerCount: number
  size?: number
}

export const SignalLamp = memo(function SignalLamp({
  size = 12,
  triggerCount,
}: SignalLampProps) {
  const [{ colors }] = useThemeStore()

  const lampRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const prevTriggerRef = useRef(triggerCount)

  useEffect(() => {
    if (triggerCount === prevTriggerRef.current) return
    prevTriggerRef.current = triggerCount

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const el = lampRef.current
      if (!el) return
      el.style.transition = "none"
      el.style.opacity = "1"
      void el.offsetHeight // force reflow to restart transition
      el.style.transition = "opacity 200ms ease-out"
      el.style.opacity = "0"
    })
  }, [triggerCount])

  const containerStyle = useMemo(
    () =>
      css({
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1px solid ${colors.outlineVariant}`,
        padding: 1,
      }),
    [size, colors.outlineVariant],
  )

  const lampStyle = useMemo(
    () =>
      css({
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        backgroundColor: colors.tertiary,
        opacity: 0,
      }),
    [colors.tertiary],
  )

  return (
    <div css={containerStyle}>
      <div ref={lampRef} css={lampStyle} />
    </div>
  )
})
