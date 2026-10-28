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

export interface FastLineChartPlotData {
  x: NumericArray | undefined
  traces: NumericArray[]
}

export interface FastLineChartGraphProps {
  style?: CSSProperties
  plotData: FastLineChartPlotData
  graphWidth: number
  graphHeight: number
  xRange?: { min?: number; max?: number }
  yRange?: { min?: number; max?: number }
  xLogScale?: boolean
  yLogScale?: boolean
  traceColors?: string[]
  /** ReactFlow viewport zoom factor for correcting mouse coordinates */
  viewportZoom?: number
  onError?: (error: string | undefined) => void
}

export interface FastLineChartGraphHandle {
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
 * Compute scale min/max from visible series data.
 * Respects partial range constraints (min only, max only, or both).
 * Returns null if no visible data exists.
 */
function computeScale(
  u: uPlot,
  scaleName: "x" | "y",
  range?: { min?: number; max?: number },
  logScale?: boolean,
): { min: number; max: number } | null {
  let dataMin = Infinity
  let dataMax = -Infinity

  if (scaleName === "y") {
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
  } else {
    const xData = u.data[0]
    if (xData) {
      for (let j = 0; j < xData.length; j++) {
        const val = xData[j] as number
        if (val < dataMin) dataMin = val
        else if (val > dataMax) dataMax = val
      }
    }
  }

  if (dataMin === Infinity || dataMax === -Infinity) return null

  const autoRange = logScale
    ? uPlot.rangeLog(dataMin, dataMax, 10, true)
    : uPlot.rangeNum(dataMin, dataMax, 0.1, true)
  return {
    min: range?.min ?? autoRange[0]!,
    max: range?.max ?? autoRange[1]!,
  }
}

const FastLineChartGraph = forwardRef<
  FastLineChartGraphHandle,
  FastLineChartGraphProps
>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const uplotRef = useRef<uPlot | null>(null)

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

  // Custom view mode: when user has zoomed or panned, disable auto-fit
  const isCustomViewRef = useRef(false)

  // Saved scale values for custom view mode
  const savedYScaleRef = useRef<{ min: number; max: number } | null>(null)
  const savedXScaleRef = useRef<{ min: number; max: number } | null>(null)

  // Store props in ref to access latest values in uPlot callbacks
  const propsRef = useRef(props)
  propsRef.current = props

  // Store ReactFlow viewportZoom in ref for use in cursor.move callback
  const viewportZoomRef = useRef(props.viewportZoom ?? 1)
  viewportZoomRef.current = props.viewportZoom ?? 1

  // Auto-index X cache
  const autoIndexRef = useRef<number[]>([])

  const traceColors = props.traceColors ?? PLOTLY_COLORS

  // Generate or reuse auto-index X values
  const getXValues = useCallback(
    (plotData: FastLineChartPlotData): NumericArray => {
      if (plotData.x !== undefined) return plotData.x
      const len = plotData.traces[0]?.length ?? 0
      if (autoIndexRef.current.length !== len) {
        autoIndexRef.current = Array.from({ length: len }, (_, i) => i)
      }
      return autoIndexRef.current
    },
    [],
  )

  // Convert to uPlot data format [xValues, trace1, trace2, ...]
  const buildData = useCallback(
    (plotData: FastLineChartPlotData): uPlot.AlignedData => {
      return [getXValues(plotData), ...plotData.traces]
    },
    [getXValues],
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

  // Reset scale function
  const resetScale = useCallback(() => {
    if (!uplotRef.current) return

    // Clear custom view mode and saved scales
    isCustomViewRef.current = false
    savedYScaleRef.current = null
    savedXScaleRef.current = null

    const u = uplotRef.current
    const p = propsRef.current

    // Compute ranges from visible data
    const xScale = computeScale(u, "x", p.xRange, p.xLogScale)
    const yScale = computeScale(u, "y", p.yRange, p.yLogScale)

    u.batch(() => {
      if (xScale) u.setScale("x", xScale)
      if (yScale) u.setScale("y", yScale)
    })
  }, [])

  // Expose reset function to parent
  useImperativeHandle(ref, () => ({ resetScale }), [resetScale])

  // Mouse coordinate correction callback (considering ReactFlow zoom)
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
            if (e.buttons === 0) {
              isPanningRef.current = false
              panStartRef.current = null
              panScaleStartRef.current = null
              isCustomViewRef.current = true
              savedYScaleRef.current = {
                min: self.scales.y.min!,
                max: self.scales.y.max!,
              }
              savedXScaleRef.current = {
                min: self.scales.x.min!,
                max: self.scales.x.max!,
              }
              handler(e)
              return null
            }

            const zoom = viewportZoomRef.current
            const currentX = e.clientX / zoom
            const currentY = e.clientY / zoom

            const dx = currentX - panStartRef.current.x
            const dy = currentY - panStartRef.current.y

            const xUnitsPerPx =
              (panScaleStartRef.current.xMax - panScaleStartRef.current.xMin) /
              self.bbox.width
            const yUnitsPerPx =
              (panScaleStartRef.current.yMax - panScaleStartRef.current.yMin) /
              self.bbox.height

            const newXMin = panScaleStartRef.current.xMin - dx * xUnitsPerPx
            const newXMax = panScaleStartRef.current.xMax - dx * xUnitsPerPx
            const newYMin = panScaleStartRef.current.yMin + dy * yUnitsPerPx
            const newYMax = panScaleStartRef.current.yMax + dy * yUnitsPerPx

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
            isPanningRef.current = false
            panStartRef.current = null
            panScaleStartRef.current = null
            isCustomViewRef.current = true
            savedYScaleRef.current = {
              min: self.scales.y.min!,
              max: self.scales.y.max!,
            }
            savedXScaleRef.current = {
              min: self.scales.x.min!,
              max: self.scales.x.max!,
            }
            e.preventDefault()
          } else {
            const select = self.select
            if (select && select.width > 0 && select.height > 0) {
              isCustomViewRef.current = true
              setTimeout(() => {
                if (uplotRef.current) {
                  savedYScaleRef.current = {
                    min: uplotRef.current.scales.y.min!,
                    max: uplotRef.current.scales.y.max!,
                  }
                  savedXScaleRef.current = {
                    min: uplotRef.current.scales.x.min!,
                    max: uplotRef.current.scales.x.max!,
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
      xLogScale?: boolean,
      yLogScale?: boolean,
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
          ...(xLogScale ? { distr: 3, log: 10 } : {}),
        },
        y: {
          auto: false,
          ...(yLogScale ? { distr: 3, log: 10 } : {}),
          range: (
            _self: uPlot,
            dataMin: number,
            dataMax: number,
          ): uPlot.Range.MinMax => {
            if (isCustomViewRef.current && savedYScaleRef.current) {
              return [savedYScaleRef.current.min, savedYScaleRef.current.max]
            }
            const autoRange = yLogScale
              ? uPlot.rangeLog(dataMin, dataMax, 10, true)
              : uPlot.rangeNum(dataMin, dataMax, 0.1, true)
            if (yRange?.min !== undefined && yRange?.max !== undefined) {
              return [yRange.min, yRange.max]
            } else if (yRange?.min !== undefined) {
              return [yRange.min, autoRange[1]]
            } else if (yRange?.max !== undefined) {
              return [autoRange[0], yRange.max]
            }
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
          size: (self: uPlot, values: string[]) => {
            if (!values || values.length === 0) return 50
            const maxLen = Math.max(...values.map(v => v.length))
            return Math.max(50, maxLen * 8 + 12)
          },
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
        setSeries: [
          (self: uPlot) => {
            if (isCustomViewRef.current) return
            const yScale = computeScale(
              self,
              "y",
              yRange,
              yLogScale,
            )
            if (yScale) {
              self.setScale("y", yScale)
            }
          },
        ],
      },
    }),
    [buildSeries, cursorBind, cursorMove],
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
      props.xLogScale,
      props.yLogScale,
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

  // Sync uPlot's cached bounding rect when ReactFlow viewport zoom changes
  useEffect(() => {
    if (uplotRef.current) {
      uplotRef.current.syncRect()
    }
  }, [props.viewportZoom])

  // Track previous range/log values for rebuild detection
  const prevRebuildKeyRef = useRef({
    xMin: props.xRange?.min,
    xMax: props.xRange?.max,
    yMin: props.yRange?.min,
    yMax: props.yRange?.max,
    xLogScale: props.xLogScale,
    yLogScale: props.yLogScale,
  })

  // Rebuild uPlot when axis range or log scale changes
  useEffect(() => {
    const prev = prevRebuildKeyRef.current
    prevRebuildKeyRef.current = {
      xMin: props.xRange?.min,
      xMax: props.xRange?.max,
      yMin: props.yRange?.min,
      yMax: props.yRange?.max,
      xLogScale: props.xLogScale,
      yLogScale: props.yLogScale,
    }

    if (
      prev.xMin === props.xRange?.min &&
      prev.xMax === props.xRange?.max &&
      prev.yMin === props.yRange?.min &&
      prev.yMax === props.yRange?.max &&
      prev.xLogScale === props.xLogScale &&
      prev.yLogScale === props.yLogScale
    ) {
      return
    }

    if (!uplotRef.current || !containerRef.current) return

    const container = containerRef.current
    const currentTraceCount = uplotRef.current.series.length - 1

    uplotRef.current.destroy()

    const data = buildData(propsRef.current.plotData)
    const opts = buildOptions(
      currentTraceCount,
      propsRef.current.graphWidth,
      propsRef.current.graphHeight,
      props.yRange,
      props.xLogScale,
      props.yLogScale,
    )

    uplotRef.current = new uPlot(opts, data, container)
  }, [
    props.xRange,
    props.yRange,
    props.xLogScale,
    props.yLogScale,
    buildData,
    buildOptions,
  ])

  // Data update
  useEffect(() => {
    if (!uplotRef.current) return

    const currentTraceCount = uplotRef.current.series.length - 1
    const newTraceCount = props.plotData.traces.length

    // Rebuild uPlot if trace count changes
    if (currentTraceCount !== newTraceCount && newTraceCount > 0) {
      const container = containerRef.current
      if (!container) return

      uplotRef.current.destroy()

      const data = buildData(props.plotData)
      const opts = buildOptions(
        newTraceCount,
        props.graphWidth,
        props.graphHeight,
        props.yRange,
        props.xLogScale,
        props.yLogScale,
      )

      uplotRef.current = new uPlot(opts, data, container)
    } else if (newTraceCount > 0) {
      const u = uplotRef.current
      const data = buildData(props.plotData)
      u.setData(data, false)

      // Recalculate X and Y scales from data (unless user has custom view)
      if (!isCustomViewRef.current) {
        const p = propsRef.current
        const xScale = computeScale(u, "x", p.xRange, p.xLogScale)
        const yScale = computeScale(u, "y", p.yRange, p.yLogScale)

        u.batch(() => {
          if (xScale) u.setScale("x", xScale)
          if (yScale) u.setScale("y", yScale)
        })
      }

      u.redraw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.plotData])

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
      <div
        ref={containerRef}
        style={props.style}
        css={css`
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

FastLineChartGraph.displayName = "FastLineChartGraph"

export default FastLineChartGraph
