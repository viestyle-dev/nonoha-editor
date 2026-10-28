import { describe, expect, it } from "vitest"

import type { PortValue } from "nonoha-client-js"

import {
  controlSignalTypeError,
  lastTruthyOfValues,
  RisingEdgeGate,
} from "@/src/hooks/control-gate-logic"

function boolValues(...batch: number[]): PortValue[] {
  return [
    {
      dataType: 0, // Bool
      shape: [batch.length],
      array: new Uint8Array(batch),
    } as unknown as PortValue,
  ]
}

describe("lastTruthyOfValues", () => {
  it("returns the truthiness of the last batch element", () => {
    expect(lastTruthyOfValues(boolValues(0, 0, 1))).toBe(true)
    expect(lastTruthyOfValues(boolValues(1, 1, 0))).toBe(false)
    expect(lastTruthyOfValues(boolValues(1))).toBe(true)
  })

  it("supports float arrays (non-zero = true)", () => {
    const values = [
      {
        dataType: 9, // Float32
        shape: [2],
        array: new Float32Array([0.0, 0.5]),
      } as unknown as PortValue,
    ]
    expect(lastTruthyOfValues(values)).toBe(true)
  })

  it("returns undefined for empty or missing values", () => {
    expect(lastTruthyOfValues(undefined)).toBeUndefined()
    expect(lastTruthyOfValues([])).toBeUndefined()
    expect(lastTruthyOfValues(boolValues())).toBeUndefined()
  })

  it("returns undefined for string ports", () => {
    const values = [
      {
        dataType: 13, // String
        shape: [1],
        array: ["result"],
      } as unknown as PortValue,
    ]
    expect(lastTruthyOfValues(values)).toBeUndefined()
  })
})

describe("RisingEdgeGate", () => {
  it("fires only on false -> true transitions", () => {
    const gate = new RisingEdgeGate()
    expect(gate.update(false)).toBe(false) // first observation is record-only
    expect(gate.update(true)).toBe(true) // rising edge
    expect(gate.update(true)).toBe(false) // sustained true does not fire
    expect(gate.update(false)).toBe(false) // falling edge is ignored
    expect(gate.update(true)).toBe(true) // fires again on the next window
  })

  it("does not fire on the first observed value (mid-window join)", () => {
    const gate = new RisingEdgeGate()
    expect(gate.update(true)).toBe(false) // unobserved -> true does not fire
    expect(gate.update(false)).toBe(false)
    expect(gate.update(true)).toBe(true)
  })

  it("prime records the value without firing", () => {
    const gate = new RisingEdgeGate()
    gate.prime(false)
    expect(gate.update(true)).toBe(true) // rising edge after prime fires

    const gate2 = new RisingEdgeGate()
    gate2.prime(true)
    expect(gate2.update(true)).toBe(false) // joined mid-window: no firing
    expect(gate2.update(false)).toBe(false)
    expect(gate2.update(true)).toBe(true)
  })

  it("prime never overwrites an already observed value", () => {
    const gate = new RisingEdgeGate()
    expect(gate.update(false)).toBe(false) // a WS frame is observed first
    gate.prime(true) // a late stale snapshot is ignored
    expect(gate.update(true)).toBe(true)
  })

  it("ignores undefined values", () => {
    const gate = new RisingEdgeGate()
    gate.prime(undefined)
    expect(gate.update(undefined)).toBe(false)
    expect(gate.update(false)).toBe(false)
    expect(gate.update(true)).toBe(true)
  })

  it("reset returns to the unobserved state", () => {
    const gate = new RisingEdgeGate()
    gate.update(false)
    gate.reset()
    expect(gate.update(true)).toBe(false) // first observation after reset is record-only
  })
})

describe("controlSignalTypeError", () => {
  it("accepts bool and numeric types (including array shapes)", () => {
    expect(controlSignalTypeError("rec", "bool")).toBeUndefined()
    expect(controlSignalTypeError("rec", "f32")).toBeUndefined()
    expect(controlSignalTypeError("clear", "u8")).toBeUndefined()
    expect(controlSignalTypeError("clear", "f32[5]")).toBeUndefined()
    expect(controlSignalTypeError("rec", "i64")).toBeUndefined()
  })

  it("rejects string signals with an in-node message", () => {
    expect(controlSignalTypeError("rec", "str")).toBe(
      "rec: 'str' signal is not supported — connect a bool output"
    )
    expect(controlSignalTypeError("clear", "str")).toBe(
      "clear: 'str' signal is not supported — connect a bool output"
    )
  })

  it("rejects unknown types", () => {
    expect(controlSignalTypeError("rec", "c64")).toContain("not supported")
  })

  it("returns undefined when no source is connected", () => {
    expect(controlSignalTypeError("rec", undefined)).toBeUndefined()
  })
})
