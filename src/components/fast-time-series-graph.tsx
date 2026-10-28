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

type InteractionMode = "zoom" | "pan"

/**
 * Type for numeric array data that uPlot accepts.
 * Supports both regular number arrays and TypedArrays for performance.
 */
export type NumericArray = number[] | uPlot.TypedArray

export interface FastTimeSeriesPlotData {
  x: number[]
  traces: NumericArray[]
  cursorPosition: number
}

export interface FastTimeSeriesGraphProps {
  style?: CSSProperties
  plotData: FastTimeSeriesPlotData
  graphWidth: number
  graphHeight: number
  yRange?: { min?: number; max?: number }
  traceColors?: string[]
  /** ReactFlow viewport zoom factor for correcting mouse coordinates */
  viewportZoom?: number
}

export interface FastTimeSeriesGraphHandle {
  resetScale: () => void
}

// Plotly.js default color palette
const PLOTLY_COLORS = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#7f7f7f", // gray
  "#bcbd22", // olive
  "#17becf", // cyan
]

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

/**
 * Compute Y scale min/max from visible series data.
 * Respects partial yRange constraints (min only, max only, or both).
 * Returns null if no visible data exists.
 */
function computeYScale(
  u: uPlot,
  yRange?: { min?: number; max?: number },
): { min: number; max: number } | null {
  let dataMin = Infinity
  let dataMax = -Infinity
  const data = u.data
  for (let i = 1; i < u.series.length; i++) {
    if (!u.series[i].show) continue
    const trace = data[i]
    if (!trace) continue
    for (let j = 0; j < trace.length; j++) {
      const val = trace[j] as number
      if (val < dataMin) dataMin = val
      else if (val > dataMax) dataMax = val
    }
  }
  if (dataMin === Infinity || dataMax === -Infinity) return null

  const autoRange = uPlot.rangeNum(dataMin, dataMax, 0.1, true)
  return {
    min: yRange?.min ?? autoRange[0]!,
    max: yRange?.max ?? autoRange[1]!,
  }
}

const FastTimeSeriesGraph = forwardRef<
  FastTimeSeriesGraphHandle,
  FastTimeSeriesGraphProps
>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<uPlot | null>(null)
  const cursorPositionRef = useRef(props.plotData.cursorPosition)

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

  const traceColors = props.traceColors ?? PLOTLY_COLORS

  // Convert to uPlot data format [xValues, trace1, trace2, ...]
  const buildData = useCallback(
    (plotData: FastTimeSeriesPlotData): uPlot.AlignedData => {
      return [plotData.x, ...plotData.traces]
    },
    [],
  )

  // Build series configuration
  const buildSeries = useCallback(
    (traceCount: number): uPlot.Series[] => {
      const series: uPlot.Series[] = [{}] // Empty entry for x-axis

      for (let i = 0; i < traceCount; i++) {
        series.push({
          stroke: traceColors[i % traceColors.length],
          width: 1,
          label: `trace ${i}`,
        })
      }

      return series
    },
    [traceColors],
  )

  // Cursor line drawing hook
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
    const xLen = propsRef.current.plotData.x.length
    const yRange = propsRef.current.yRange

    // Compute Y range from visible series data
    const yScale = computeYScale(u, yRange)

    u.batch(() => {
      u.setScale("x", { min: 0, max: xLen > 0 ? xLen - 1 : 1 })
      if (yScale) {
        u.setScale("y", yScale)
      }
    })
  }, [])

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

  // Cursor bind handlers for pan mode
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

  // Build uPlot options
  const buildOptions = useCallback(
    (
      traceCount: number,
      width: number,
      height: number,
      yRange?: { min?: number; max?: number },
    ): uPlot.Options => ({
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
        show: true,
      },
      scales: {
        x: {
          time: false,
        },
        y: {
          auto: false,
          range: (
            _self: uPlot,
            dataMin: number,
            dataMax: number,
          ): uPlot.Range.MinMax => {
            // If in custom view mode (user zoomed/panned), use saved scale values
            if (isCustomViewRef.current && savedYScaleRef.current) {
              return [savedYScaleRef.current.min, savedYScaleRef.current.max]
            }
            // Calculate auto range for partial autorange support
            const autoRange = uPlot.rangeNum(dataMin, dataMax, 0.1, true)
            // Handle partial yRange (min only, max only, or both)
            if (yRange?.min !== undefined && yRange?.max !== undefined) {
              return [yRange.min, yRange.max]
            } else if (yRange?.min !== undefined) {
              return [yRange.min, autoRange[1]]
            } else if (yRange?.max !== undefined) {
              return [autoRange[0], yRange.max]
            }
            // Neither set → fully auto
            return autoRange
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
      series: buildSeries(traceCount),
      hooks: {
        draw: [drawCursorLine],
        setSeries: [
          (self: uPlot) => {
            // Recalculate Y range when series visibility changes (legend click)
            if (isCustomViewRef.current) return
            const yScale = computeYScale(self, yRange)
            if (yScale) {
              self.setScale("y", yScale)
            }
          },
        ],
      },
    }),
    [buildSeries, cursorBind, cursorMove, drawCursorLine],
  )

  // Initialization
  useEffect(() => {
    if (!containerRef.current) return

    const traceCount = props.plotData.traces.length
    const data = buildData(props.plotData)
    const opts = buildOptions(
      traceCount,
      props.graphWidth,
      props.graphHeight,
      props.yRange,
    )

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
  // Without this, cursor position is incorrect because uPlot only re-caches
  // on window resize/scroll, not on CSS transform: scale() changes.
  useEffect(() => {
    if (uplotRef.current) {
      uplotRef.current.syncRect()
    }
  }, [props.viewportZoom])

  // Track previous Y-axis range
  const prevYRangeRef = useRef(props.yRange)

  // Rebuild uPlot when Y-axis range changes (to modify scales.auto setting)
  useEffect(() => {
    // Skip on initial mount (already created by initialization effect)
    const prevYRange = prevYRangeRef.current
    prevYRangeRef.current = props.yRange

    // Skip if value hasn't actually changed
    if (
      prevYRange?.min === props.yRange?.min &&
      prevYRange?.max === props.yRange?.max
    ) {
      return
    }

    if (!uplotRef.current || !containerRef.current) return

    const container = containerRef.current
    const currentTraceCount = uplotRef.current.series.length - 1

    // Destroy existing uPlot
    uplotRef.current.destroy()

    // Rebuild with new options (auto setting changes based on yRange presence)
    const data = buildData(propsRef.current.plotData)
    const opts = buildOptions(
      currentTraceCount,
      propsRef.current.graphWidth,
      propsRef.current.graphHeight,
      props.yRange,
    )

    uplotRef.current = new uPlot(opts, data, container)
  }, [props.yRange, buildData, buildOptions])

  // Data update (directly manipulate uPlot - no React re-render)
  useEffect(() => {
    if (!uplotRef.current) return

    const currentTraceCount = uplotRef.current.series.length - 1 // Exclude x-axis
    const newTraceCount = props.plotData.traces.length

    // Rebuild uPlot if trace count changes
    if (currentTraceCount !== newTraceCount && newTraceCount > 0) {
      const container = containerRef.current
      if (!container) return

      // Destroy existing uPlot
      uplotRef.current.destroy()

      const data = buildData(props.plotData)
      const opts = buildOptions(
        newTraceCount,
        props.graphWidth,
        props.graphHeight,
        props.yRange,
      )

      uplotRef.current = new uPlot(opts, data, container)
    } else if (newTraceCount > 0) {
      // Efficiently update data only when trace count is the same
      cursorPositionRef.current = props.plotData.cursorPosition
      const data = buildData(props.plotData)
      // setData(data, false) preserves scales but skips redraw
      uplotRef.current.setData(data, false)

      // Recalculate Y scale from visible series (unless user has custom view)
      if (!isCustomViewRef.current) {
        const yScale = computeYScale(uplotRef.current, propsRef.current.yRange)
        if (yScale) {
          uplotRef.current.setScale("y", yScale)
        }
      }

      // Explicitly call redraw() to update the display
      uplotRef.current.redraw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.plotData])

  return (
    <div
      css={css({
        position: "relative",
        // width: props.graphWidth,
        // height: props.graphHeight,
        background: "#fff",
      })}
    >
      <GraphToolbar
        onResetAxis={resetScale}
        mode={interactionMode}
        onModeChange={setInteractionMode}
      />
      <div
        ref={containerRef}
        style={props.style}
        css={css`
          /* Plotly-like styles */
          .uplot {
            font-family: inherit;
            background: #fff;
          }
          .u-legend {
            font-size: 11px;
            background: transparent;
            text-align: left;
            padding: 4px;
          }
          .u-series {
            padding: 1px 4px;
          }
          .u-marker {
            width: 12px;
            height: 2px;
          }
          .u-label {
            color: #444;
          }
          .u-value {
            color: #666;
          }
        `}
      />
    </div>
  )
})

FastTimeSeriesGraph.displayName = "FastTimeSeriesGraph"

export default FastTimeSeriesGraph
