import { EDITOR_NODE_SPECS } from "@/src/editor-nodes/specs"

export interface EditorNodeMetadata {
  type: string
  label: string
  description: string
  category: string
  inputs: { name: string; types: string[]; description: string }[]
  outputs: { name: string; types: string[]; description: string }[]
}

/** Add-menu metadata of the editor nodes, derived from public/editor-nodes.json. */
export const EDITOR_NODE_CATALOG: Record<string, EditorNodeMetadata> = Object.fromEntries(
  EDITOR_NODE_SPECS.map((spec) => [
    spec.type,
    {
      type: spec.type,
      label: spec.label,
      description: spec.description,
      category: spec.category,
      inputs: spec.inputs,
      outputs: spec.outputs,
    },
  ]),
)
