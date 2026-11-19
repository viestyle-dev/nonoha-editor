/**
 * Port type colors: one hue per data type (the palette is built by
 * NodeFlowColorsStoreProvider), used by handles and edges.
 */

import { Hct, hexFromArgb } from "@material/material-color-utilities"
import { nameToPortDataType } from "nonoha-client-js"

export interface PortPallet {
  dataTypes: { [typeName: string]: Hct }
}

export function getHctFromPortValueType(type: string, dataTypesPallet: PortPallet): Hct {
  const baseTypeName = type.split("[")[0]
  const baseType = nameToPortDataType[baseTypeName]
  if (baseType === undefined) {
    throw new Error(`Unknown data type: ${type}`)
  }
  return dataTypesPallet.dataTypes[baseTypeName]
}

/** "#rrggbb" of a port value type ("f32[6x8]": the f32 color). */
export function portTypeColor(type: string, pallet: PortPallet): string {
  return hexFromArgb(getHctFromPortValueType(type, pallet).toInt())
}

/**
 * The colors along an edge, from its source port's type to its target
 * port's: they differ when the base types differ (`any` is a type like the
 * others), and the edge then shifts from one to the other. An end without a
 * type (an editor node) takes the other end's; null when neither has one.
 */
export function edgeColors(
  sourceType: string | undefined,
  targetType: string | undefined,
  pallet: PortPallet,
): readonly [string, string] | null {
  const from = sourceType ? portTypeColor(sourceType, pallet) : undefined
  const to = targetType ? portTypeColor(targetType, pallet) : undefined
  if (from === undefined) return to === undefined ? null : [to, to]
  return [from, to ?? from]
}

/**
 * An input handle's color: its type's when it accepts one base type, the
 * neutral color when it accepts several (or does not say).
 */
export function inputHandleColor(accepts: readonly string[] | undefined, pallet: PortPallet, neutral: string): string {
  if (!accepts || accepts.length === 0) return neutral
  const base = accepts[0].split("[")[0]
  if (nameToPortDataType[base] === undefined || accepts.some(type => type.split("[")[0] !== base)) return neutral
  return portTypeColor(accepts[0], pallet)
}
