import type { PortValue } from "nonoha-client-js"

// Inspects the type string ("bool", "f32[5]", ...) of the port connected to a
// rec/clear handle. Bool and numeric types are supported (numeric values are
// interpreted as 0 = false / non-zero = true), so they return undefined.
// String and unknown types silently disable the gate — a real trap — so a
// message for the node's in-node error display is returned instead.
const NUMERIC_BASE_TYPES = new Set([
  "bool",
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
  "f32",
  "f64",
])

export function controlSignalTypeError(
  handle: "rec" | "clear",
  typeStr: string | undefined
): string | undefined {
  if (typeStr === undefined) {
    return undefined
  }
  const baseType = typeStr.split("[")[0]
  if (NUMERIC_BASE_TYPES.has(baseType)) {
    return undefined
  }
  return `${handle}: '${typeStr}' signal is not supported — connect a bool output`
}

// Returns the truthiness of the last element (= latest batch value) of the
// first PortValue. Intended for bool/numeric ports. Empty, missing, or string
// ports return undefined (undecidable).
export function lastTruthyOfValues(
  values: readonly PortValue[] | undefined
): boolean | undefined {
  const value = values?.[0]
  if (!value || value.array == null || value.array.length === 0) {
    return undefined
  }
  const last = value.array[value.array.length - 1]
  if (typeof last === "string") {
    return undefined
  }
  return Number(last) !== 0
}

// Detects only false -> true rising edges of a bool state signal.
// Because it works on state (not pulses), it can be re-synced from a REST
// snapshot (current value) via prime(): prime only records the value and
// never fires. The first value observed from the unobserved (undefined)
// state is also record-only (no firing when joining mid-window).
export class RisingEdgeGate {
  private last: boolean | undefined = undefined

  // Sync with the current value (never fires). Does nothing once a value has
  // been observed, so a REST response arriving after a WS frame cannot
  // overwrite the newer state with a stale one.
  prime(value: boolean | undefined): void {
    if (this.last === undefined && value !== undefined) {
      this.last = value
    }
  }

  // Applies a new observation; returns true when it is a rising edge.
  update(value: boolean | undefined): boolean {
    if (value === undefined) {
      return false
    }
    const prev = this.last
    this.last = value
    return prev === false && value
  }

  reset(): void {
    this.last = undefined
  }
}
