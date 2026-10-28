import { memo } from "react"
import { css } from "@emotion/react"

export const OriginMarker = memo(() => {
  return (
    <div
      css={css({
        position: "absolute",
        width: "100px",
        height: "100px",
      })}
    >
      <div
        css={css`
          position: absolute;
          top: -1px;
          left: -50px;
          width: 100px;
          height: 2px;
          background: grey;
        `}
      />
      <div
        css={css`
          position: absolute;
          top: -50px;
          left: -1px;
          width: 2px;
          height: 100px;
          background: grey;
        `}
      />
    </div>
  )
})
