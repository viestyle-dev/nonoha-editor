"use client"

import { css } from "@emotion/react"

/**
 * The ring around a port while values flow through it.
 *
 * The ring is steady: it fades in and out (0.3 s) when the port starts or
 * stops and does not animate in between. A breathing ring cost the page a
 * frame on every refresh while anything flowed: each animated ring was a
 * compositor layer of its own (sixty or so in a running graph), redrawn every
 * frame and re-layered whenever anything else repainted.
 */

/**
 * For an element that is positioned, carries `--port-glow` (the ring color)
 * and `data-flowing` while values flow.
 */
export const portRing = css({
  "&::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    pointerEvents: "none",
    opacity: 0.7,
    boxShadow: "0 0 0 4px transparent",
    transition: "box-shadow 0.3s ease-out",
  },
  "&[data-flowing]::after": {
    boxShadow: "0 0 0 4px var(--port-glow)",
  },
})
