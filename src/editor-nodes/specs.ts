/**
 * Editor node specifications — the single source for the editor's own nodes.
 *
 * The data lives in `public/editor-nodes.json`, so the same file is served
 * as `/editor-nodes.json`, shipped in `editor_html/` with the engine, and read
 * by the nonoha CLI and AI agents. The node registry (`NODE_TYPES`), the add
 * menu catalog and the node prototypes are all derived from it here.
 */

import type { ViewMetadata } from "nonoha-views"

import editorNodes from "@/public/editor-nodes.json"

export interface EditorPortSpec {
  /** Handle id on the node (also the targetHandle/sourceHandle in editor_edges). */
  name: string
  types: string[]
  description: string
}

export interface EditorSettingSpec {
  type: "number" | "string" | "boolean"
  default?: number | string | boolean
  enum?: string[]
  description: string
}

export interface EditorNodeSpec {
  type: string
  label: string
  category: string
  description: string
  inputs: EditorPortSpec[]
  outputs: EditorPortSpec[]
  /** Initial size for nodes that are resized by the user. */
  size?: { width: number; height: number }
  /** Keys of the node's `data` in settings.json (nodeData in the editor). */
  settings: Record<string, EditorSettingSpec>
}

export interface EditorNodesDocument {
  schema: number
  nodes: EditorNodeSpec[]
  /** The views built into the editor ("builtin/<id>"), listed for tools; the definitions in nonoha-views are the source. */
  builtinViews: ViewMetadata[]
}

// JSON imports infer a union per entry; the specs test verifies the shape.
export const EDITOR_NODES_DOCUMENT = editorNodes as unknown as EditorNodesDocument

export const EDITOR_NODE_SPECS: readonly EditorNodeSpec[] = EDITOR_NODES_DOCUMENT.nodes

export const EDITOR_NODE_SPEC_BY_TYPE: ReadonlyMap<string, EditorNodeSpec> = new Map(
  EDITOR_NODE_SPECS.map((spec) => [spec.type, spec]),
)

export const EDITOR_NODE_ID_PREFIX = "$editor:"
