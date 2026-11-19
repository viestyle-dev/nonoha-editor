/**
 * An edge's stroke width shows how much each value it carries holds, from
 * the source port's declared type (as Pure Data, Max and vvvv draw signal
 * and spread connections thicker): the main flows (images, flow fields,
 * audio blocks) stand out and control values recede.
 */

const SCALAR = 2
const SMALL = 2.5 // up to SMALL_ELEMENTS
const LARGE = 4
const SMALL_ELEMENTS = 64

/** "f32": 2, "f32[6x8]": 2.5, "u8[180x320]" or "f32[?x?x2]": 4; untyped or `any`: 2.5. */
export function edgeWeight(type: string | undefined): number {
  if (!type) return SMALL
  const open = type.indexOf("[")
  if (open < 0) return type === "any" ? SMALL : SCALAR
  if (type.startsWith("any")) return SMALL
  let elements = 1
  for (const dim of type.slice(open + 1, -1).split("x")) {
    if (dim === "?" || dim === "N") return LARGE
    elements *= Number(dim)
  }
  return elements <= 1 ? SCALAR : elements <= SMALL_ELEMENTS ? SMALL : LARGE
}
