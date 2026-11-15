import { readFileSync, readdirSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { EDITOR_NODE_SPECS } from "@/src/editor-nodes/specs"

const ROOT = path.resolve(__dirname, "../../..")
const NODES_DIR = path.join(ROOT, "src/nodes/editor-nodes")

/** Component name -> source text of its file (e.g. FastTimeSeriesGraphNode -> fast-time-series-graph-node.tsx). */
function componentSources(): Map<string, string> {
  const sources = new Map<string, string>()
  for (const file of readdirSync(NODES_DIR)) {
    if (!file.endsWith(".tsx")) continue
    const name = file
      .replace(/\.tsx$/, "")
      .split("-")
      .map((part) => (part === "log10" ? "Log10" : part[0].toUpperCase() + part.slice(1)))
      .join("")
    sources.set(name, readFileSync(path.join(NODES_DIR, file), "utf8"))
  }
  return sources
}

/** Handle ids declared by a component, including the shared rec/clear gate handles. */
function handleIds(source: string): Set<string> {
  const ids = new Set<string>()
  const pattern = /<NodeHandle(?:Left|Right)\s+id="([^"]+)"/g
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) ids.add(match[1])
  const gates = source.match(/<ControlGateHandles\s+withClear(=\{(true|false)\})?/)
  if (gates) {
    ids.add("rec")
    if (gates[2] !== "false") ids.add("clear")
  }
  return ids
}

const NOT_EDITOR_NODES = new Set(["WaypointNode"]) // internal canvas helper, not in the add menu

describe("editor-nodes.json", () => {
  const sources = componentSources()

  it("has unique types", () => {
    const types = EDITOR_NODE_SPECS.map((s) => s.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it("covers every editor node component, and only those", () => {
    const components = Array.from(sources.keys()).filter((name) => !NOT_EDITOR_NODES.has(name)).sort()
    expect(EDITOR_NODE_SPECS.map((s) => s.type).sort()).toEqual(components)
  })

  it("lists every node in the React Flow registry", () => {
    const registry = readFileSync(path.join(ROOT, "src/constants/node-types.ts"), "utf8")
    for (const spec of EDITOR_NODE_SPECS) {
      expect(registry, spec.type).toMatch(new RegExp(`^\\s+${spec.type},$`, "m"))
    }
  })

  it.each(EDITOR_NODE_SPECS.map((s) => [s.type, s] as const))("%s handles match the component", (type, spec) => {
    const ids = handleIds(sources.get(type)!)
    const declared = [...spec.inputs, ...spec.outputs].map((p) => p.name).sort()
    expect(declared).toEqual(Array.from(ids).sort())
  })

  it("documents settings with known value types", () => {
    for (const spec of EDITOR_NODE_SPECS) {
      for (const [key, setting] of Object.entries(spec.settings)) {
        expect(["number", "string", "boolean"], `${spec.type}.${key}`).toContain(setting.type)
        if (setting.default !== undefined && !setting.enum) {
          expect(typeof setting.default, `${spec.type}.${key}`).toBe(setting.type)
        }
        if (setting.enum && setting.default !== undefined) {
          expect(setting.enum, `${spec.type}.${key}`).toContain(setting.default)
        }
      }
    }
  })
})
