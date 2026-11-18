"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Node,
  NodeProps,
  NodeResizeControl,
  ResizeDragEvent,
  ResizeParams,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react"
import {
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import { css } from "@emotion/react"
import type { GraphEndpoint } from "nonoha-client-js"
import {
  createViewHost,
  loadView,
  resolveSettings,
  watchOptionsFor,
  type DefinedView,
  type ViewHost,
  type ViewInputSpec,
  type ViewSettingSpec,
} from "nonoha-views"

import { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { useThemeStore } from "@/src/stores/theme-store"
import { NodeHandleLeft } from "@/src/components/node-handle"
import { EditableTypography } from "@/src/components/editable-typography"
import { BasicNodeToolbar } from "@/src/components/basic-node-toolbar"
import { useChartTheme } from "@/src/hooks/use-chart-theme"
import { useEditorInput } from "@/src/hooks/use-editor-input"
import { useViewCatalog, viewThemeFrom } from "@/src/views/view-catalog"

export type PluginViewNode = Node<{
  label: string
  graphEndpoint: GraphEndpoint | undefined
  editorModelUpdater: EditorModelUpdater
  nodeData?: {
    /** "<plugin id>/<view id>" or "builtin/<view id>" */
    view?: string
    settings?: Record<string, unknown>
  }
}>

/** One input handle of the view, fed by a solid or dashed edge. */
const ViewInput = memo(function ViewInput({
  input,
  graphEndpoint,
  hostRef,
  hostReady,
}: {
  input: ViewInputSpec
  graphEndpoint: GraphEndpoint | undefined
  hostRef: { current: ViewHost | null }
  /** The view is mounted: values before that would be lost (the current one too). */
  hostReady: boolean
}) {
  const name = input.name
  // What the view declares it needs: sampling for dashed edges, and the
  // current value first for "latest" inputs on solid edges.
  const options = useMemo(() => watchOptionsFor(input), [input])
  useEditorInput(graphEndpoint, name, (values, info) => hostRef.current?.deliver(name, values, info), options, {
    current: input.delivery === "latest",
    enabled: hostReady,
  })
  return (
    <Tooltip title={`${input.description ?? name}\n[${input.accepts.join(", ")}]`} placement="left">
      <NodeHandleLeft id={name} label={name} />
    </Tooltip>
  )
})

function SettingField({
  name,
  spec,
  value,
  onChange,
}: {
  name: string
  spec: ViewSettingSpec
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (spec.type === "boolean") {
    return (
      <label css={css({ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 })}>
        {name}
        <Switch size="small" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
      </label>
    )
  }
  if (spec.enum) {
    return (
      <FormControl size="small" fullWidth>
        <InputLabel>{name}</InputLabel>
        <Select label={name} value={String(value ?? "")} onChange={e => onChange(e.target.value)}>
          {spec.enum.map(option => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }
  return (
    <TextField
      size="small"
      label={name}
      helperText={spec.description}
      defaultValue={value ?? ""}
      type={spec.type === "number" ? "number" : "text"}
      inputProps={spec.type === "number" ? { min: spec.min, max: spec.max } : undefined}
      onBlur={e => {
        // Store what the view gets (parsed, within min/max); empty = default.
        const raw = e.target.value
        if (raw === "") return onChange(undefined)
        const resolved = resolveSettings({ [name]: spec }, { [name]: raw })[name]
        e.target.value = resolved === undefined ? "" : String(resolved)
        onChange(resolved)
      }}
    />
  )
}

/**
 * Editor node that hosts a view (a plugin's static/views module or a
 * built-in of nonoha-views). Inputs come from the view's manifest.
 * A missing view keeps its settings and shows a placeholder.
 */
export const PluginViewNode = memo((props: NodeProps<PluginViewNode>) => {
  const [{ colors }] = useThemeStore()
  const chartTheme = useChartTheme()
  const { setNodes } = useReactFlow()
  const catalog = useViewCatalog()
  const editorModelUpdater = props.data.editorModelUpdater
  const viewKey = props.data.nodeData?.view
  const settings = props.data.nodeData?.settings
  const entry = viewKey ? catalog.entries.get(viewKey) : undefined
  // Settings as the view gets them, shown in the settings panel.
  const resolvedSettings = useMemo(() => resolveSettings(entry?.settings, settings), [entry, settings])
  const [titleEditing, setTitleEditing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [definition, setDefinition] = useState<DefinedView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<ViewHost | null>(null)
  const [hostReady, setHostReady] = useState(false)

  const viewTheme = useMemo(
    () => viewThemeFrom(chartTheme, colors.surfaceContainerHighest),
    [chartTheme, colors.surfaceContainerHighest],
  )
  const themeRef = useRef(viewTheme)
  themeRef.current = viewTheme
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Load the view module (plugin views) or take the built-in definition.
  useEffect(() => {
    setDefinition(null)
    setError(null)
    if (!entry) return
    let cancelled = false
    loadView(entry)
      .then(view => !cancelled && setDefinition(view))
      .catch(e => !cancelled && setError(String(e?.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [entry])

  // Mount it; follow the container's size.
  useEffect(() => {
    const element = containerRef.current
    if (!definition || !element) return
    const rect = element.getBoundingClientRect()
    let host: ViewHost
    try {
      host = createViewHost(definition, element, {
        theme: themeRef.current,
        settings: settingsRef.current,
        size: { width: element.clientWidth || rect.width, height: element.clientHeight || rect.height },
        onError: e => setError(String((e as Error)?.message ?? e)),
      })
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
      return
    }
    hostRef.current = host
    setHostReady(true)
    const observer = new ResizeObserver(() => host.resize(element.clientWidth, element.clientHeight))
    observer.observe(element)
    return () => {
      observer.disconnect()
      hostRef.current = null
      setHostReady(false)
      host.destroy()
      element.replaceChildren()
    }
  }, [definition])

  // Input handles come from the view's manifest, which loads after the node
  // first renders: have React Flow measure them again so edges can attach.
  const updateNodeInternals = useUpdateNodeInternals()
  const inputsKey = (entry?.inputs ?? []).map(input => input.name).join("|")
  useEffect(() => {
    updateNodeInternals(props.id)
  }, [inputsKey, props.id, updateNodeInternals])

  useEffect(() => hostRef.current?.setTheme(viewTheme), [viewTheme])
  useEffect(() => hostRef.current?.setSettings(settings ?? {}), [settings])

  const changeSetting = useCallback(
    (name: string, value: unknown) => {
      const next = { ...(settingsRef.current ?? {}), [name]: value }
      setNodes(nodes =>
        nodes.map(node =>
          node.id === props.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  nodeData: { ...(node.data as PluginViewNode["data"]).nodeData, settings: next },
                },
              }
            : node,
        ),
      )
      editorModelUpdater.patchNodeData(props.id, { settings: next })
    },
    [props.id, setNodes, editorModelUpdater],
  )

  const onResizeEnd = useCallback(
    (_event: ResizeDragEvent, params: ResizeParams) => {
      editorModelUpdater.updateNodeSize(props.id, params.width, params.height)
    },
    [editorModelUpdater, props.id],
  )

  const placeholder = !viewKey
    ? "No view selected"
    : !catalog.loaded
      ? "Loading views…"
      : !entry
        ? `View "${viewKey}" is not available here (plugin not loaded, or the engine does not serve plugin views). Its settings are kept.`
        : error
          ? `View failed: ${error}`
          : !definition
            ? "Loading view…"
            : null
  const origin = entry
    ? entry.source === "builtin"
      ? "built-in view"
      : `${entry.pluginId}${entry.pluginVersion ? ` ${entry.pluginVersion}` : ""}`
    : viewKey

  return (
    <Paper
      css={css({
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        height: "100%",
        position: "relative",
        color: colors.onSurface,
        background: colors.surfaceContainerHighest,
        outlineOffset: "4px",
      })}
      style={{ outline: props.selected ? `1px solid ${colors.tertiary}` : "none" }}
    >
      {props.selected && (
        <NodeResizeControl
          minWidth={160}
          minHeight={120}
          position="bottom-right"
          onResizeEnd={onResizeEnd}
          style={{ background: "transparent", border: "none" }}
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
      <div className={titleEditing ? "" : "drag-handle"} css={css({ width: "100%", padding: "8px 8px 0" })}>
        <EditableTypography
          editing={titleEditing}
          onEditingChange={editing => setTitleEditing(editing)}
          text={props.data.label}
          fontSize={14}
        />
        <Typography variant="caption" css={css({ color: colors.onSurfaceVariant })}>
          {entry?.title ?? "View"} · {origin}
        </Typography>
      </div>
      <div css={css({ display: "flex", flexGrow: 1, minHeight: 0, gap: 4, padding: "4px 0" })}>
        <div css={css({ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" })}>
          {(entry?.inputs ?? []).map(input => (
            <ViewInput
              key={input.name}
              input={input}
              graphEndpoint={props.data.graphEndpoint}
              hostRef={hostRef}
              hostReady={hostReady}
            />
          ))}
        </div>
        <div css={css({ position: "relative", flexGrow: 1, minWidth: 0, marginRight: 8 })} className="nodrag">
          <div ref={containerRef} css={css({ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 4 })} />
          {placeholder && (
            <Typography
              variant="caption"
              css={css({
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 8,
                color: error ? colors.error : colors.onSurfaceVariant,
                background: colors.surfaceContainerLow,
                borderRadius: 4,
              })}
            >
              {placeholder}
            </Typography>
          )}
        </div>
      </div>
      <Divider />
      <div css={css({ display: "flex", justifyContent: "flex-end", padding: "0 4px", minHeight: 24 })}>
        <IconButton
          size="small"
          disabled={!entry || Object.keys(entry.settings).length === 0}
          onClick={() => setDetailsOpen(!detailsOpen)}
          css={css({ color: detailsOpen ? colors.primary : colors.onSurfaceVariant, fontSize: 14 })}
        >
          <SettingsIcon fontSize="inherit" />
        </IconButton>
      </div>
      {detailsOpen && entry && (
        <div
          className="nodrag"
          css={css({
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 10,
            background: colors.surfaceContainer,
            borderRadius: 4,
            boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)",
            padding: 8,
            border: `1px solid ${colors.outlineVariant}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          })}
        >
          {Object.entries(entry.settings).map(([name, spec]) => (
            <SettingField
              key={name}
              name={name}
              spec={spec}
              value={resolvedSettings[name]}
              onChange={value => changeSetting(name, value)}
            />
          ))}
        </div>
      )}
    </Paper>
  )
})

PluginViewNode.displayName = "PluginViewNode"
