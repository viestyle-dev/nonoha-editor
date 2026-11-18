import type { NodePrototype } from "@/src/components/node-add-menu"
import type { GraphEndpoint } from "nonoha-client-js"
import type { EditorModelUpdater } from "@/src/api/editor-model-updater"
import { EDITOR_NODE_ID_PREFIX, EDITOR_NODE_SPECS } from "@/src/editor-nodes/specs"

/**
 * Creates the editor node prototypes for the node add menu, one per entry
 * of public/editor-nodes.json (the single source of the editor nodes).
 *
 * @param graphEndpoint - The graph endpoint for API communication
 * @param editorModelUpdater - The updater for editor model changes
 * @returns Array of node prototypes for the add menu
 */
export function makeNodePrototypes(
  graphEndpoint: GraphEndpoint,
  editorModelUpdater: EditorModelUpdater
): NodePrototype[] {
  // Shared data for all editor nodes
  const commonData = { graphEndpoint, editorModelUpdater }

  return EDITOR_NODE_SPECS.map((spec) => {
    const prototype: NodePrototype = {
      id: `${EDITOR_NODE_ID_PREFIX}${spec.type}`,
      data: { label: spec.label, ...commonData },
      type: spec.type,
    }
    if (spec.size) prototype.style = { width: spec.size.width, height: spec.size.height }
    return prototype
  })
}
