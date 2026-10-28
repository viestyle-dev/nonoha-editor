import { useMemo } from "react"
import {
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material"
import { ExpandLess, ExpandMore, Search } from "@mui/icons-material"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"
import type { NodeSource, UnifiedNodeEntry } from "./types"

interface NodeListPanelProps {
  entries: UnifiedNodeEntry[]
  searchText: string
  onSearchChange: (text: string) => void
  selectedKey: string | null
  onSelect: (entry: UnifiedNodeEntry) => void
  onAdd: (entry: UnifiedNodeEntry) => void
  collapsedCategories: Set<string>
  onToggleCategory: (category: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
}

export const CATEGORY_ORDER = [
  "Input",
  "Visualization",
  "Display",
  "Utility",
  "Math",
  "Signal Processing",
  "Array",
  "I/O",
  "Ports",
]

export function categorySort(a: string, b: string): number {
  const ai = CATEGORY_ORDER.indexOf(a)
  const bi = CATEGORY_ORDER.indexOf(b)
  if (ai !== -1 && bi !== -1) return ai - bi
  if (ai !== -1) return -1
  if (bi !== -1) return 1
  return a.localeCompare(b)
}

const SOURCE_ORDER: NodeSource[] = ["editor", "port", "engine"]
const SOURCE_LABELS: Record<NodeSource, string> = {
  editor: "Editor Nodes",
  port: "Ports",
  engine: "Engine Nodes",
}

export function sourceSort(a: NodeSource, b: NodeSource): number {
  return SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b)
}

interface Section {
  source: NodeSource
  label: string
  categories: [string, UnifiedNodeEntry[]][]
}

function portSignature(entry: UnifiedNodeEntry): string {
  const parts: string[] = []
  if (entry.inputCount > 0) parts.push(`${entry.inputCount} in`)
  if (entry.outputCount > 0) parts.push(`${entry.outputCount} out`)
  return parts.length > 0 ? parts.join(" \u2192 ") : "no ports"
}

export function NodeListPanel({
  entries,
  searchText,
  onSearchChange,
  selectedKey,
  onSelect,
  onAdd,
  collapsedCategories,
  onToggleCategory,
  onKeyDown,
}: NodeListPanelProps) {
  const [{ colors }] = useThemeStore()

  const sections = useMemo((): Section[] => {
    const bySource = new Map<NodeSource, Map<string, UnifiedNodeEntry[]>>()
    for (const entry of entries) {
      let catMap = bySource.get(entry.source)
      if (!catMap) {
        catMap = new Map()
        bySource.set(entry.source, catMap)
      }
      const list = catMap.get(entry.category)
      if (list) list.push(entry)
      else catMap.set(entry.category, [entry])
    }
    return SOURCE_ORDER
      .filter(source => bySource.has(source))
      .map(source => ({
        source,
        label: SOURCE_LABELS[source],
        categories: Array.from(bySource.get(source)!.entries()).sort(
          ([a], [b]) => categorySort(a, b),
        ),
      }))
  }, [entries])

  const containerStyle = useMemo(
    () =>
      css({
        width: 280,
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${colors.outlineVariant}`,
        overflow: "hidden",
      }),
    [colors.outlineVariant],
  )

  const listStyle = useMemo(
    () =>
      css({
        flexGrow: 1,
        overflowY: "auto",
        paddingTop: 0,
        minHeight: 0,
      }),
    [],
  )

  const categoryHeaderStyle = useMemo(
    () =>
      css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 12px",
        cursor: "pointer",
        userSelect: "none",
        color: colors.onSurfaceVariant,
        fontWeight: 500,
        fontSize: 13,
        "&:hover": {
          backgroundColor: colors.surfaceContainerHigh,
        },
      }),
    [colors.onSurfaceVariant, colors.surfaceContainerHigh],
  )

  const sectionHeaderStyle = useMemo(
    () =>
      css({
        fontSize: 12,
        fontWeight: 600,
        color: colors.primary,
        padding: "8px 12px 4px 12px",
        letterSpacing: 0.5,
        userSelect: "none",
      }),
    [colors.primary],
  )

  const secondaryStyle = useMemo(
    () =>
      css({
        color: colors.onSurfaceVariant,
        fontSize: "0.7rem",
      }),
    [colors.onSurfaceVariant],
  )

  const isSearching = searchText.length > 0

  return (
    <div css={containerStyle}>
      <TextField
        placeholder="Search nodes..."
        value={searchText}
        onChange={e => onSearchChange(e.target.value)}
        onKeyDown={onKeyDown}
        fullWidth
        size="small"
        autoFocus
        autoComplete="off"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search css={css({ fontSize: 20, color: colors.onSurfaceVariant })} />
            </InputAdornment>
          ),
        }}
        css={css({ padding: "8px 8px 4px 8px" })}
      />

      <List css={listStyle} dense>
        {sections.map((section, sectionIndex) => (
          <div key={section.source}>
            {sectionIndex > 0 && <Divider css={css({ marginTop: 4, marginBottom: 4 })} />}
            <div css={sectionHeaderStyle}>{section.label}</div>
            {section.categories.map(([category, items]) => {
              const isCollapsed = !isSearching && collapsedCategories.has(category)
              return (
                <div key={category}>
                  <div
                    css={categoryHeaderStyle}
                    onClick={() => onToggleCategory(category)}
                  >
                    <span>
                      {category}{" "}
                      <span css={css({ opacity: 0.6 })}>({items.length})</span>
                    </span>
                    {isSearching ? null : isCollapsed ? (
                      <ExpandMore css={css({ fontSize: 18 })} />
                    ) : (
                      <ExpandLess css={css({ fontSize: 18 })} />
                    )}
                  </div>
                  {!isCollapsed &&
                    items.map(entry => (
                      <ListItemButton
                        key={entry.key}
                        data-node-key={entry.key}
                        selected={selectedKey === entry.key}
                        onClick={() => onSelect(entry)}
                        onDoubleClick={() => onAdd(entry)}
                        css={css({
                          paddingLeft: 16,
                          paddingTop: 2,
                          paddingBottom: 2,
                        })}
                      >
                        <ListItemText
                          primary={entry.label}
                          secondary={portSignature(entry)}
                          primaryTypographyProps={{
                            css: css({ fontSize: 13 }),
                            noWrap: true,
                          }}
                          secondaryTypographyProps={{
                            css: secondaryStyle,
                          }}
                        />
                      </ListItemButton>
                    ))}
                </div>
              )
            })}
          </div>
        ))}
        {entries.length === 0 && (
          <Typography
            css={css({
              textAlign: "center",
              padding: 16,
              color: colors.onSurfaceVariant,
              fontSize: 13,
            })}
          >
            No nodes found
          </Typography>
        )}
      </List>
    </div>
  )
}
