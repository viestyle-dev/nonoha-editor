import { describe, expect, it } from "vitest"
import type { InspectorPortRef, WatchCallbacks, WatchHandle, WatchOptions } from "nonoha-client-js"
import { EditorInspector, portKey } from "../inspector-store"

const REF: InspectorPortRef = { node: "Cam_1", dir: "out", port: "frame" }

function withFakeClient() {
  const inspector = new EditorInspector("localhost:8000", "g")
  const callbacks: WatchCallbacks[] = []
  const fake = {
    watch(ref: InspectorPortRef, _options: WatchOptions, cb: WatchCallbacks): WatchHandle {
      callbacks.push(cb)
      return { ref, setInterval: () => {}, snapshot: () => {}, unwatch: () => {} }
    },
    close() {},
  }
  ;(inspector as unknown as { client: unknown }).client = fake
  return { inspector, callbacks }
}

describe("EditorInspector", () => {
  it("keeps what a port could not show until its next sample, and forgets it with the last watch", () => {
    const { inspector, callbacks } = withFakeClient()
    const key = portKey(REF)
    let changes = 0
    inspector.subscribeProblem(key, () => changes++)
    const first = inspector.watch(REF, {}, { onSample: () => {} })!
    const second = inspector.watch(REF, {}, { onSample: () => {} })!
    callbacks[0].onError!("too_large", "u8[1x4000x4000x3]: 48000000 bytes, more than max_bytes 262144 even reduced")
    expect(inspector.problemOf(key)).toMatch(/^Too large to show: u8\[1x4000x4000x3\]/)
    callbacks[0].onSample({ values: [] } as unknown as Parameters<WatchCallbacks["onSample"]>[0])
    expect(inspector.problemOf(key)).toBeUndefined()
    callbacks[1].onGone!()
    expect(inspector.problemOf(key)).toMatch(/gone/)
    first.unwatch()
    expect(inspector.problemOf(key)).toMatch(/gone/) // still shown by the second
    second.unwatch()
    second.unwatch() // twice: counted once
    expect(inspector.problemOf(key)).toBeUndefined()
    expect(changes).toBe(4)
  })

  it("hands each waiting preview one slot when another gives its slot back", () => {
    const inspector = new EditorInspector("localhost:8000", "g")
    const releases = Array.from({ length: 8 }, () => inspector.holdPreviewSlot(() => {}))
    const granted: boolean[][] = [[], []]
    const waitA = inspector.holdPreviewSlot(g => granted[0].push(g))
    const waitB = inspector.holdPreviewSlot(g => granted[1].push(g))
    expect(granted).toEqual([[false], [false]])
    releases[0]()
    expect(granted).toEqual([[false, true], [false]]) // one slot, one preview
    releases[1]()
    expect(granted).toEqual([[false, true], [false, true]])
    releases[2]() // nobody waits any more: the slot stays free
    waitA()
    waitB()
    const again = Array.from({ length: 4 }, () => {
      let got = false
      inspector.holdPreviewSlot(g => (got = g))
      return got
    })
    expect(again).toEqual([true, true, true, false]) // 5 held of 8: no slot leaked to a stale listener
  })
})
