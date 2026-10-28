import { useMemo } from "react"
import { alpha, Button, Chip, Typography } from "@mui/material"
import { Add } from "@mui/icons-material"
import { css } from "@emotion/react"
import { hexFromArgb } from "@material/material-color-utilities"
import { useThemeStore } from "@/src/stores/theme-store"
import {
  getHctFromPortValueType,
  useNodeFlowColorsStore,
} from "@/src/stores/node-flow-colors-store"
import type { UnifiedNodeEntry, CatalogPortInfo, CatalogPropertyInfo } from "./types"

interface NodeDetailPanelProps {
  entry: UnifiedNodeEntry | null
  onAdd: (entry: UnifiedNodeEntry) => void
}

function getPortColor(type: string, pallet: never): string {
  try {
    return hexFromArgb(getHctFromPortValueType(type, pallet).toInt())
  } catch {
    return "#888"
  }
}

function TypeChip({ type, pallet }: { type: string; pallet: never }) {
  const chipColor = getPortColor(type, pallet)
  return (
    <span
      css={css({
        display: "inline-block",
        padding: "0 5px",
        borderRadius: 6,
        fontSize: 10,
        fontFamily: "monospace",
        backgroundColor: alpha(chipColor, 0.15),
        color: chipColor,
        lineHeight: "16px",
        flexShrink: 0,
      })}
    >
      {type}
    </span>
  )
}

function PortRow({
  port,
  pallet,
  colors,
}: {
  port: CatalogPortInfo
  pallet: never
  colors: { onSurface: string; onSurfaceVariant: string }
}) {
  const hasValueNames = port.value_names && port.value_names.some(n => n != null)

  if (hasValueNames) {
    // Multi-value port with named values — expand vertically
    return (
      <div css={css({ paddingLeft: 4, marginBottom: 2 })}>
        <div css={css({ display: "flex", alignItems: "baseline", gap: 6, minHeight: 20 })}>
          <span
            css={css({
              width: 7, height: 7, borderRadius: 1,
              backgroundColor: getPortColor(port.types[0] || "any", pallet),
              flexShrink: 0, alignSelf: "center",
            })}
          />
          <span css={css({ fontSize: 12, fontWeight: 500, color: colors.onSurface, flexShrink: 0 })}>
            {port.name}
          </span>
          {port.description && (
            <span css={css({ fontSize: 11, color: colors.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
              {port.description}
            </span>
          )}
        </div>
        {port.types.map((t, i) => (
          <div key={i} css={css({ display: "flex", alignItems: "center", gap: 4, paddingLeft: 16, minHeight: 18 })}>
            <TypeChip type={t} pallet={pallet} />
            {port.value_names?.[i] && (
              <span css={css({ fontSize: 11, color: colors.onSurfaceVariant })}>
                {port.value_names[i]}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Simple port — single line
  return (
    <div css={css({ display: "flex", alignItems: "baseline", gap: 6, minHeight: 20, paddingLeft: 4 })}>
      <span
        css={css({
          width: 7, height: 7, borderRadius: 1,
          backgroundColor: getPortColor(port.types[0] || "any", pallet),
          flexShrink: 0, alignSelf: "center",
        })}
      />
      <span css={css({ fontSize: 12, fontWeight: 500, color: colors.onSurface, flexShrink: 0, whiteSpace: "nowrap" })}>
        {port.name}
      </span>
      {port.types.map((t, i) => (
        <TypeChip key={i} type={t} pallet={pallet} />
      ))}
      {port.description && (
        <span css={css({ fontSize: 11, color: colors.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
          {port.description}
        </span>
      )}
    </div>
  )
}

function PropertyRow({
  name,
  info,
  colors,
}: {
  name: string
  info: CatalogPropertyInfo
  colors: { onSurface: string; onSurfaceVariant: string }
}) {
  return (
    <div css={css({ display: "flex", alignItems: "baseline", gap: 6, minHeight: 20, paddingLeft: 4 })}>
      <span css={css({ fontSize: 12, fontWeight: 500, color: colors.onSurface, flexShrink: 0, whiteSpace: "nowrap" })}>
        {name}
      </span>
      {info.default != null && (
        <span css={css({ fontSize: 11, fontFamily: "monospace", color: colors.onSurfaceVariant, flexShrink: 0 })}>
          = {String(info.default)}
        </span>
      )}
      {info.description && (
        <span css={css({ fontSize: 11, color: colors.onSurfaceVariant, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
          {info.description}
        </span>
      )}
    </div>
  )
}

export function NodeDetailPanel({ entry, onAdd }: NodeDetailPanelProps) {
  const [{ colors }] = useThemeStore()
  const [flowColorsState] = useNodeFlowColorsStore()

  const containerStyle = useMemo(
    () =>
      css({
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }),
    [],
  )

  const contentStyle = useMemo(
    () =>
      css({
        flexGrow: 1,
        overflowY: "auto",
        padding: "12px 16px",
        minHeight: 0,
      }),
    [],
  )

  const sectionLabelStyle = useMemo(
    () =>
      css({
        fontSize: 11,
        fontWeight: 600,
        color: colors.primary,
        marginTop: 10,
        marginBottom: 2,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
      }),
    [colors.primary],
  )

  if (!entry) {
    return (
      <div
        css={css({
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <Typography css={css({ color: colors.onSurfaceVariant, fontSize: 13 })}>
          Select a node to view details
        </Typography>
      </div>
    )
  }

  const catalogEntry = entry.catalogEntry
  const inputs: CatalogPortInfo[] =
    catalogEntry?.inputs ??
    ((entry as { _editorInputs?: CatalogPortInfo[] })._editorInputs ?? [])
  const outputs: CatalogPortInfo[] =
    catalogEntry?.outputs ??
    ((entry as { _editorOutputs?: CatalogPortInfo[] })._editorOutputs ?? [])
  const properties = catalogEntry?.properties
  const propertyEntries = properties ? Object.entries(properties) : []
  const pallet = flowColorsState.pallet as never

  const sourceBadge =
    entry.source === "engine"
      ? "Engine"
      : entry.source === "editor"
        ? "Editor"
        : "Port"

  return (
    <div css={containerStyle}>
      <div css={contentStyle}>
        {/* Header */}
        <div css={css({ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 })}>
          <Typography css={css({ fontSize: 16, fontWeight: 600, color: colors.onSurface })}>
            {entry.label}
          </Typography>
          <Chip
            label={sourceBadge}
            size="small"
            css={css({
              height: 18,
              fontSize: 10,
              backgroundColor: alpha(colors.primary, 0.1),
              color: colors.primary,
            })}
          />
        </div>
        <Typography css={css({ fontSize: 11, color: colors.onSurfaceVariant, marginBottom: 6 })}>
          {entry.category}
        </Typography>

        {/* Description */}
        {entry.description && (
          <Typography css={css({ fontSize: 12, color: colors.onSurface, lineHeight: 1.5, marginBottom: 4 })}>
            {entry.description}
          </Typography>
        )}

        {/* Inputs */}
        {inputs.length > 0 && (
          <>
            <Typography css={sectionLabelStyle}>Inputs</Typography>
            {inputs.map(port => (
              <PortRow key={port.name} port={port} pallet={pallet} colors={colors} />
            ))}
          </>
        )}

        {/* Outputs */}
        {outputs.length > 0 && (
          <>
            <Typography css={sectionLabelStyle}>Outputs</Typography>
            {outputs.map(port => (
              <PortRow key={port.name} port={port} pallet={pallet} colors={colors} />
            ))}
          </>
        )}

        {/* Properties */}
        {propertyEntries.length > 0 && (
          <>
            <Typography css={sectionLabelStyle}>Properties</Typography>
            {propertyEntries.map(([name, info]) => (
              <PropertyRow key={name} name={name} info={info} colors={colors} />
            ))}
          </>
        )}
      </div>

      {/* Add button */}
      <div css={css({ padding: "8px 16px", borderTop: `1px solid ${colors.outlineVariant}` })}>
        <Button
          variant="contained"
          size="small"
          startIcon={<Add />}
          onClick={() => onAdd(entry)}
          fullWidth
        >
          Add Node
        </Button>
      </div>
    </div>
  )
}
