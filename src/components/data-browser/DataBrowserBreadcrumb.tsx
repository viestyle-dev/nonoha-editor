import { Breadcrumbs, Link, Typography } from "@mui/material"
import FolderOpenIcon from "@mui/icons-material/FolderOpen"
import { memo } from "react"
import { css } from "@emotion/react"
import { useThemeStore } from "@/src/stores/theme-store"

export interface DataBrowserBreadcrumbProps {
  pathSegments: string[]
  onNavigate: (segmentIndex: number) => void
}

export const DataBrowserBreadcrumb = memo(
  (props: DataBrowserBreadcrumbProps) => {
    const { pathSegments, onNavigate } = props
    const [{ colors }] = useThemeStore()

    return (
      <Breadcrumbs
        css={css({
          padding: "8px 16px",
          fontSize: 13,
        })}
        separator=">"
      >
        <Link
          component="button"
          underline="hover"
          onClick={() => onNavigate(-1)}
          css={css({
            display: "flex",
            alignItems: "center",
            gap: 4,
            color: colors.primary,
            fontSize: 13,
            cursor: "pointer",
          })}
        >
          <FolderOpenIcon css={css({ fontSize: 16 })} />
          data
        </Link>
        {pathSegments.map((segment, i) =>
          i < pathSegments.length - 1 ? (
            <Link
              key={i}
              component="button"
              underline="hover"
              onClick={() => onNavigate(i)}
              css={css({
                color: colors.primary,
                fontSize: 13,
                cursor: "pointer",
              })}
            >
              {segment}
            </Link>
          ) : (
            <Typography
              key={i}
              css={css({
                color: colors.onSurface,
                fontSize: 13,
              })}
            >
              {segment}
            </Typography>
          ),
        )}
      </Breadcrumbs>
    )
  },
)
