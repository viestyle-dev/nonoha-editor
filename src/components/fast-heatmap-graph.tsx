"use client"

import { css } from "@emotion/react"
import {
  CSSProperties,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import uPlot from "uplot"
import "uplot/dist/uPlot.min.css"
import { Home, ZoomIn, OpenWith } from "@mui/icons-material"

import { HeatmapRaster, PORTLAND_STOPS } from "@/src/lib/heatmap-raster"

type InteractionMode = "zoom" | "pan"

export interface FastHeatmapGraphProps {
  style?: CSSProperties
  // Stable raster reference owned by the node's GraphWrapper. The renderer
  // never mutates it; it only reads pixels/geometry.
  raster: HeatmapRaster
  // Incremented by the wrapper whenever the raster pixels changed. Triggers
  // a putImageData + redraw without rebuilding anything.
  paintVersion: number
  cursorPosition: number
  // Y-axis values for the data rows (e.g. frequencies). Assumed uniformly
  // spaced (row 0 = yLabels[0], last row = yLabels[yLength - 1]). When
  // absent, row indices [0, yLength - 1] are used.
  yLabels?: Float32Array
  graphWidth: number
  graphHeight: number
  yRange?: { min?: number; max?: number }
  // Effective z range currently used for coloring (for the colorbar labels).
  zRange?: { min: number; max: number }
  /** ReactFlow viewport zoom factor for correcting mouse coordinates */
  viewportZoom?: number
}

export interface FastHeatmapGraphHandle {
  resetScale: () => void
}

// Toolbar component (memoized to prevent re-renders during graph updates)
const GraphToolbar = memo(
  ({
    onResetAxis,
    mode,
    onModeChange,
  }: {
    onResetAxis: () => void
    mode: InteractionMode
    onModeChange: (mode: InteractionMode) => void
  }) => {
    const iconStyle = (isActive: boolean) =>
      css({
        fontSize: 18,
        color: isActive ? "#1976d2" : "#666",
        cursor: "pointer",
        "&:hover": { color: isActive ? "#1976d2" : "#333" },
      })

    return (
      <div
        css={css({
          display: "flex",
          flexDirection: "row-reverse",
          gap: 4,
          padding: "4px 4px 0px 4px",
        })}
      >
        <Home
          css={css({
            fontSize: 18,
            color: "#666",
            cursor: "pointer",
            "&:hover": { color: "#333" },
          })}
          onClick={onResetAxis}
          titleAccess="Reset Axis"
        />
        <OpenWith
          css={iconStyle(mode === "pan")}
          onClick={() => onModeChange("pan")}
          titleAccess="Pan Mode"
        />
        <ZoomIn
          css={iconStyle(mode === "zoom")}
          onClick={() => onModeChange("zoom")}
          titleAccess="Zoom Mode"
        />
      </div>
    )
  },
)

GraphToolbar.displayName = "GraphToolbar"

// CSS gradient matching the Portland LUT, bottom = zMin, top = zMax.
const COLORBAR_GRADIENT = `linear-gradient(to top, ${PORTLAND_STOPS.map(
  ([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${t * 100}%`,
).join(", ")})`

const FastHeatmapGraph = forwardRef<
  FastHeatmapGraphHandle,
  FastHeatmapGraphProps
>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<uPlot | null>(null)
  const cursorPositionRef = useRef(props.cursorPosition)

  // Offscreen canvas holding the raster at 1 pixel per cell. Blitted onto
  // the uPlot canvas (scaled, no smoothing) on every redraw.
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const imageDataRef = useRef<ImageData | null>(null)
  const geometryRef = useRef<{ xLength: number; yLength: number }>({
    xLength: 0,
    yLength: 0,
  })

  // Interaction mode state
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("zoom")
  const interactionModeRef = useRef<InteractionMode>("zoom")
  interactionModeRef.current = interactionMode

  // Pan state refs
  const isPanningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const panScaleStartRef = useRef<{
    xMin: number
    xMax: number
    yMin: number
    yMax: number
  } | null>(null)

  // Custom view mode: when user has zoomed or panned, disable auto-fit and yRange
  const isCustomViewRef = useRef(false)

  // Saved Y scale values for custom view mode
  const savedYScaleRef = useRef<{ min: number; max: number } | null>(null)

  // Store props in ref to access latest values in uPlot callbacks
  const propsRef = useRef(props)
  propsRef.current = props

  // Store ReactFlow viewportZoom in ref for use in cursor.move callback
  const viewportZoomRef = useRef(props.viewportZoom ?? 1)
  viewportZoomRef.current = props.viewportZoom ?? 1

  // Y bounds of the data rows: yLabels ends when present, else row indices.
  const yBounds = useCallback((): [number, number] => {
    const p = propsRef.current
    const yLen = p.raster.yLength
    const labels = p.yLabels
    if (labels && labels.length >= 2) {
      const lo = labels[0]
      const hi = labels[labels.length - 1]
      if (hi > lo) {
        return [lo, hi]
      }
    }
    return [0, Math.max(1, yLen - 1)]
  }, [])

  // Full y scale with partial yRange override (custom view handled by caller).
  const computeYScale = useCallback((): { min: number; max: number } => {
    const bounds = yBounds()
    const yRange = propsRef.current.yRange
    return {
      min: yRange?.min ?? bounds[0],
      max: yRange?.max ?? bounds[1],
    }
  }, [yBounds])

  // Blits the offscreen raster onto the plot area, mapping the source
  // rectangle from the current x/y scale ranges so zoom, pan, and the
  // yMin/yMax crop all render correctly. Registered on drawClear so grid
  // lines and axes are painted on top.
  const blitRaster = useCallback(
    (u: uPlot) => {
      const off = offscreenRef.current
      const p = propsRef.current
      const xLen = p.raster.xLength
      const yLen = p.raster.yLength
      if (!off || xLen === 0 || yLen === 0) {
        return
      }

      const xMin = u.scales.x.min
      const xMax = u.scales.x.max
      const yMin = u.scales.y.min
      const yMax = u.scales.y.max
      if (
        xMin == null ||
        xMax == null ||
        yMin == null ||
        yMax == null ||
        xMax <= xMin ||
        yMax <= yMin
      ) {
        return
      }

      // Column index c is drawn centered on x = c, so source pixel
      // coordinate = value + 0.5.
      const sx = xMin + 0.5
      const sw = xMax - xMin

      // Data row r sits at y value yb0 + r * (yb1 - yb0) / (yLen - 1) and at
      // source pixel row (yLen - 1 - r) (the raster is vertically flipped),
      // so value v maps to source pixel y = (yLen - 1 - rowOf(v)) + 0.5.
      let sy: number
      let sh: number
      if (yLen === 1) {
        // A single data row fills the whole plot height.
        sy = 0
        sh = 1
      } else {
        const [yb0, yb1] = yBounds()
        const rowsPerUnit = (yLen - 1) / (yb1 - yb0)
        const rowTop = (yMax - yb0) * rowsPerUnit
        const rowBottom = (yMin - yb0) * rowsPerUnit
        sy = yLen - 1 - rowTop + 0.5
        sh = rowTop - rowBottom
      }

      const ctx = u.ctx
      ctx.save()
      ctx.beginPath()
      ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height)
      ctx.clip()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(
        off,
        sx,
        sy,
        sw,
        sh,
        u.bbox.left,
        u.bbox.top,
        u.bbox.width,
        u.bbox.height,
      )
      ctx.restore()
    },
    [yBounds],
  )

  // Hover tooltip element showing the hovered cell's x/y/z values. It lives
  // inside uPlot's cursor overlay (u.over) so cursor.left/top CSS pixel
  // coordinates apply directly — same pattern as the official uPlot
  // tooltips demo (demos/tooltips.html).
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const initTooltip = useCallback((u: uPlot) => {
    const tt = document.createElement("div")
    tt.style.position = "absolute"
    tt.style.display = "none"
    tt.style.pointerEvents = "none"
    tt.style.zIndex = "10"
    tt.style.background = "rgba(255, 255, 255, 0.95)"
    tt.style.border = "1px solid #999"
    tt.style.borderRadius = "3px"
    tt.style.padding = "3px 6px"
    tt.style.fontSize = "10px"
    tt.style.lineHeight = "1.4"
    tt.style.color = "#333"
    tt.style.whiteSpace = "pre"
    tt.style.fontVariantNumeric = "tabular-nums"
    // Destroyed together with the chart (u.over is part of uPlot's DOM).
    u.over.appendChild(tt)
    tooltipRef.current = tt
  }, [])

  // Fired on every cursor move. Snaps the cursor position to the nearest
  // cell (columns are centered on integer x; rows via the yBounds mapping)
  // and shows x (column index), y (row value, e.g. frequency), z.
  const updateTooltip = useCallback(
    (u: uPlot) => {
      const tt = tooltipRef.current
      if (!tt) return

      const left = u.cursor.left
      const top = u.cursor.top
      const p = propsRef.current
      const raster = p.raster
      const yLen = raster.yLength
      if (
        left == null ||
        top == null ||
        left < 0 ||
        top < 0 ||
        yLen === 0 ||
        isPanningRef.current
      ) {
        tt.style.display = "none"
        return
      }

      const col = Math.round(u.posToVal(left, "x"))
      let row: number
      if (yLen === 1) {
        row = 0
      } else {
        const [yb0, yb1] = yBounds()
        const yVal = u.posToVal(top, "y")
        row = Math.round(((yVal - yb0) / (yb1 - yb0)) * (yLen - 1))
      }
      if (col < 0 || col >= raster.xLength || row < 0 || row >= yLen) {
        tt.style.display = "none"
        return
      }

      const z = raster.valueAt(col, row)
      const yDisp =
        p.yLabels && row < p.yLabels.length ? p.yLabels[row] : row
      tt.textContent = `x: ${col}\ny: ${formatZ(yDisp)}\nz: ${
        Number.isNaN(z) ? "--" : formatZ(z)
      }`
      tt.style.display = "block"

      // Place at the bottom-right of the cursor; flip near the plot edges.
      const offset = 10
      const x =
        left + offset + tt.offsetWidth > u.over.clientWidth
          ? left - offset - tt.offsetWidth
          : left + offset
      const y =
        top + offset + tt.offsetHeight > u.over.clientHeight
          ? top - offset - tt.offsetHeight
          : top + offset
      tt.style.left = `${x}px`
      tt.style.top = `${y}px`
    },
    [yBounds],
  )

  // Cursor line drawing hook (same as the fast time-series chart).
  const drawCursorLine = useCallback((u: uPlot) => {
    const ctx = u.ctx
    const cursorPos = cursorPositionRef.current
    const cursorX = u.valToPos(cursorPos, "x", true)

    // Don't draw if outside graph area
    if (cursorX < u.bbox.left || cursorX > u.bbox.left + u.bbox.width) {
      return
    }

    ctx.save()
    ctx.strokeStyle = "grey"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cursorX, u.bbox.top)
    ctx.lineTo(cursorX, u.bbox.top + u.bbox.height)
    ctx.stroke()
    ctx.restore()
  }, [])

  // Reset scale function
  const resetScale = useCallback(() => {
    if (!uplotRef.current) return

    // Clear custom view mode and saved Y scale
    isCustomViewRef.current = false
    savedYScaleRef.current = null

    const u = uplotRef.current
    const xLen = propsRef.current.raster.xLength
    const yScale = computeYScale()

    u.batch(() => {
      u.setScale("x", { min: 0, max: xLen > 1 ? xLen - 1 : 1 })
      u.setScale("y", yScale)
    })
  }, [computeYScale])

  // Expose reset function to parent
  useImperativeHandle(ref, () => ({ resetScale }), [resetScale])

  // Mouse coordinate correction callback (considering ReactFlow zoom).
  // Bypasses uPlot's cached bounding rect by computing directly from the
  // mouse event and a fresh getBoundingClientRect(). This is necessary
  // because uPlot only re-caches the rect on window scroll/resize and
  // mouseenter — not when a parent CSS transform: scale() changes (as
  // happens with ReactFlow viewport zoom via ctrl+scroll).
  const cursorMove = useCallback(
    (self: uPlot, mouseLeft: number, mouseTop: number): [number, number] => {
      const zoom = viewportZoomRef.current
      if (zoom === 1) return [mouseLeft, mouseTop]

      const e = self.cursor.event
      if (e) {
        const rect = self.over.getBoundingClientRect()
        return [
          (e.clientX - rect.left) / zoom,
          (e.clientY - rect.top) / zoom,
        ]
      }
      return [mouseLeft / zoom, mouseTop / zoom]
    },
    [],
  )

  // Cursor bind handlers for pan mode (same behavior as the fast
  // time-series chart: pixel delta -> data units, applied to both scales).
  const cursorBind = useCallback((): uPlot.Cursor["bind"] => {
    return {
      mousedown: (
        self: uPlot,
        _targ: HTMLElement,
        handler: (e: MouseEvent) => null,
      ) => {
        return (e: MouseEvent): null => {
          if (e.button === 0 && interactionModeRef.current === "pan") {
            // Left click in pan mode - start panning
            isPanningRef.current = true
            const zoom = viewportZoomRef.current
            panStartRef.current = { x: e.clientX / zoom, y: e.clientY / zoom }
            panScaleStartRef.current = {
              xMin: self.scales.x.min!,
              xMax: self.scales.x.max!,
              yMin: self.scales.y.min!,
              yMax: self.scales.y.max!,
            }
            e.preventDefault()
          } else {
            // Default behavior (zoom selection)
            handler(e)
          }
          return null
        }
      },
      mousemove: (
        self: uPlot,
        _targ: HTMLElement,
        handler: (e: MouseEvent) => null,
      ) => {
        return (e: MouseEvent): null => {
          if (
            isPanningRef.current &&
            panStartRef.current &&
            panScaleStartRef.current
          ) {
            // Check if mouse button is still pressed (e.buttons === 0 means no button)
            // This handles cases where mouseup was missed (e.g., released outside canvas)
            if (e.buttons === 0) {
              // Mouse button was released - stop panning
              isPanningRef.current = false
              panStartRef.current = null
              panScaleStartRef.current = null
              isCustomViewRef.current = true
              savedYScaleRef.current = {
                min: self.scales.y.min!,
                max: self.scales.y.max!,
              }
              handler(e)
              return null
            }

            const zoom = viewportZoomRef.current
            const currentX = e.clientX / zoom
            const currentY = e.clientY / zoom

            // Calculate pixel delta
            const dx = currentX - panStartRef.current.x
            const dy = currentY - panStartRef.current.y

            // Convert pixel delta to data units
            const xUnitsPerPx =
              (panScaleStartRef.current.xMax - panScaleStartRef.current.xMin) /
              self.bbox.width
            const yUnitsPerPx =
              (panScaleStartRef.current.yMax - panScaleStartRef.current.yMin) /
              self.bbox.height

            // Calculate new scale ranges (invert direction for natural panning)
            const newXMin = panScaleStartRef.current.xMin - dx * xUnitsPerPx
            const newXMax = panScaleStartRef.current.xMax - dx * xUnitsPerPx
            const newYMin = panScaleStartRef.current.yMin + dy * yUnitsPerPx
            const newYMax = panScaleStartRef.current.yMax + dy * yUnitsPerPx

            // Apply new scales
            self.batch(() => {
              self.setScale("x", { min: newXMin, max: newXMax })
              self.setScale("y", { min: newYMin, max: newYMax })
            })

            e.preventDefault()
          } else {
            handler(e)
          }
          return null
        }
      },
      mouseup: (
        self: uPlot,
        _targ: HTMLElement,
        handler: (e: MouseEvent) => null,
      ) => {
        return (e: MouseEvent): null => {
          if (isPanningRef.current) {
            // Panning completed - mark as custom view and save Y scale
            isPanningRef.current = false
            panStartRef.current = null
            panScaleStartRef.current = null
            isCustomViewRef.current = true
            savedYScaleRef.current = {
              min: self.scales.y.min!,
              max: self.scales.y.max!,
            }
            e.preventDefault()
          } else {
            // Zoom selection completed - mark as custom view if drag occurred
            const select = self.select
            if (select && select.width > 0 && select.height > 0) {
              isCustomViewRef.current = true
              // Save Y scale after zoom is applied (use setTimeout to get updated values)
              setTimeout(() => {
                if (uplotRef.current) {
                  savedYScaleRef.current = {
                    min: uplotRef.current.scales.y.min!,
                    max: uplotRef.current.scales.y.max!,
                  }
                }
              }, 0)
            }
            handler(e)
          }
          return null
        }
      },
    }
  }, [])

  // Two-point dummy data spanning the x range; the z-matrix lives outside
  // uPlot and is blitted by the drawClear hook.
  const buildData = useCallback((xLength: number): uPlot.AlignedData => {
    const last = xLength > 1 ? xLength - 1 : 1
    return [
      [0, last],
      [null, null],
    ]
  }, [])

  // Build uPlot options
  const buildOptions = useCallback(
    (width: number, height: number): uPlot.Options => ({
      width,
      height,
      cursor: {
        show: true,
        drag: {
          x: true,
          y: true,
          setScale: true,
        },
        move: cursorMove,
        bind: cursorBind(),
      },
      legend: {
        // A single dummy z series has no useful legend.
        show: false,
      },
      scales: {
        x: {
          time: false,
        },
        y: {
          auto: false,
          range: (): uPlot.Range.MinMax => {
            // If in custom view mode (user zoomed/panned), use saved scale values
            if (isCustomViewRef.current && savedYScaleRef.current) {
              return [savedYScaleRef.current.min, savedYScaleRef.current.max]
            }
            const yScale = computeYScale()
            return [yScale.min, yScale.max]
          },
        },
      },
      axes: [
        {
          show: true,
          stroke: "#888",
          grid: { stroke: "rgba(136, 136, 136, 0.3)", width: 1 },
          ticks: { stroke: "#888", width: 1 },
        },
        {
          show: true,
          stroke: "#888",
          grid: { stroke: "rgba(136, 136, 136, 0.3)", width: 1 },
          ticks: { stroke: "#888", width: 1 },
          size: (self: uPlot, values: string[]) => {
            if (!values || values.length === 0) return 50
            const maxLen = Math.max(...values.map(v => v.length))
            return Math.max(50, maxLen * 8 + 12)
          },
        },
      ],
      series: [
        {},
        {
          label: "z",
          // Scale owner only; the raster is painted by the drawClear hook.
          paths: () => null,
          points: { show: false },
        },
      ],
      hooks: {
        init: [initTooltip],
        drawClear: [blitRaster],
        draw: [drawCursorLine],
        setCursor: [updateTooltip],
      },
    }),
    [
      blitRaster,
      computeYScale,
      cursorBind,
      cursorMove,
      drawCursorLine,
      initTooltip,
      updateTooltip,
    ],
  )

  // (Re)creates the offscreen canvas when the raster geometry changes and
  // uploads the current pixels. Returns true when the geometry changed.
  const syncOffscreen = useCallback((): boolean => {
    const raster = propsRef.current.raster
    const xLen = raster.xLength
    const yLen = raster.yLength
    if (xLen === 0 || yLen === 0) {
      return false
    }

    let geometryChanged = false
    if (
      geometryRef.current.xLength !== xLen ||
      geometryRef.current.yLength !== yLen ||
      !offscreenRef.current
    ) {
      geometryChanged = true
      geometryRef.current = { xLength: xLen, yLength: yLen }
      const canvas = document.createElement("canvas")
      canvas.width = xLen
      canvas.height = yLen
      offscreenRef.current = canvas
      // ImageData wraps the raster's pixel buffer by reference, so a single
      // instance stays valid until the raster is reallocated.
      imageDataRef.current = new ImageData(raster.pixels, xLen, yLen)
    }

    const ctx = offscreenRef.current!.getContext("2d")
    if (ctx && imageDataRef.current) {
      ctx.putImageData(imageDataRef.current, 0, 0)
    }
    return geometryChanged
  }, [])

  // Initialization
  useEffect(() => {
    if (!containerRef.current) return

    const opts = buildOptions(props.graphWidth, props.graphHeight)
    const data = buildData(props.raster.xLength || 2)

    uplotRef.current = new uPlot(opts, data, containerRef.current)

    return () => {
      if (uplotRef.current) {
        uplotRef.current.destroy()
        uplotRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only on initial mount

  // Size change
  useEffect(() => {
    if (uplotRef.current) {
      uplotRef.current.setSize({
        width: props.graphWidth,
        height: props.graphHeight,
      })
    }
  }, [props.graphWidth, props.graphHeight])

  // Sync uPlot's cached bounding rect when ReactFlow viewport zoom changes.
  useEffect(() => {
    if (uplotRef.current) {
      uplotRef.current.syncRect()
    }
  }, [props.viewportZoom])

  // Track previous Y-axis range
  const prevYRangeRef = useRef(props.yRange)

  // Re-apply the y scale when the yMin/yMax settings change. No rebuild is
  // needed because the range function reads propsRef.
  useEffect(() => {
    const prevYRange = prevYRangeRef.current
    prevYRangeRef.current = props.yRange

    if (
      prevYRange?.min === props.yRange?.min &&
      prevYRange?.max === props.yRange?.max
    ) {
      return
    }
    if (!uplotRef.current) return

    isCustomViewRef.current = false
    savedYScaleRef.current = null
    uplotRef.current.setScale("y", computeYScale())
  }, [props.yRange, computeYScale])

  // Re-apply the y scale when yLabels arrive or change (unless the user is
  // in a custom view).
  useEffect(() => {
    if (!uplotRef.current || isCustomViewRef.current) return
    uplotRef.current.setScale("y", computeYScale())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.yLabels])

  // Paint update: upload pixels to the offscreen canvas and redraw.
  useEffect(() => {
    if (!uplotRef.current) return

    const geometryChanged = syncOffscreen()
    cursorPositionRef.current = props.cursorPosition

    if (geometryChanged) {
      // New xLength/yLength: refresh the dummy data and reset the view.
      isCustomViewRef.current = false
      savedYScaleRef.current = null
      uplotRef.current.setData(buildData(props.raster.xLength), false)
      resetScale()
    }
    uplotRef.current.redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.paintVersion])

  const zMinLabel =
    props.zRange !== undefined ? formatZ(props.zRange.min) : "--"
  const zMaxLabel =
    props.zRange !== undefined ? formatZ(props.zRange.max) : "--"

  return (
    <div
      css={css({
        position: "relative",
        background: "#fff",
      })}
    >
      <GraphToolbar
        onResetAxis={resetScale}
        mode={interactionMode}
        onModeChange={setInteractionMode}
      />
      <div css={css({ display: "flex", flexDirection: "row" })}>
        <div
          ref={containerRef}
          style={props.style}
          css={css`
            .uplot {
              font-family: inherit;
              background: #fff;
            }
          `}
        />
        {/* Colorbar: CSS gradient matching the Portland LUT */}
        <div
          css={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 4px",
            fontSize: 10,
            color: "#666",
            fontVariantNumeric: "tabular-nums",
          })}
        >
          <span>{zMaxLabel}</span>
          <div
            css={css({
              flexGrow: 1,
              width: 12,
              margin: "2px 0",
              borderRadius: 2,
              background: COLORBAR_GRADIENT,
            })}
          />
          <span>{zMinLabel}</span>
        </div>
      </div>
    </div>
  )
})

function formatZ(v: number): string {
  if (!Number.isFinite(v)) return "--"
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 100000 || abs < 0.01)) {
    return v.toExponential(1)
  }
  return String(Math.round(v * 100) / 100)
}

FastHeatmapGraph.displayName = "FastHeatmapGraph"

export default FastHeatmapGraph
