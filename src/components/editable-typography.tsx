import { memo, useState } from "react"
import { css } from "@emotion/react"
import { TextField, Typography } from "@mui/material"

export interface EditableTypographyProps {
  editing: boolean
  onEditingChange: (editing: boolean) => void
  text: string
  fontSize: number
}

export const EditableTypography = memo(
  ({ editing, onEditingChange, fontSize, text }: EditableTypographyProps) => {
    return (
      <div
        css={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          width: "100%",
          fontSize: fontSize,
        })}
        onDoubleClick={() => {
          onEditingChange(true)
        }}
      >
        <Typography
          css={css({
            flexGrow: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: "1.2em",
            fontSize: "inherit",
            visibility: editing ? "hidden" : "visible",
          })}
        >
          {text}
        </Typography>
        {editing && (
          <div
            css={css({
              // height: "1.2em",
              display: "flex",
              alignItems: "center",
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            })}
          >
            <TextField
              variant="outlined"
              size="small"
              sx={{
                fontSize: fontSize,
              }}
              value={text}
              onBlur={() => {
                onEditingChange(false)
              }}
              autoFocus
              slotProps={{
                input: {
                  style: {
                    fontSize: "inherit",
                  },
                },
                htmlInput: {
                  style: {
                    fontSize: "0.875em",
                    padding: "4px 8px",
                  },
                },
              }}
            ></TextField>
          </div>
        )}
      </div>
    )
  }
)
