import type { DefinedView, ViewManifest, ViewManifestEntry, ViewMetadata } from './sdk'
import { VIEW_SDK_VERSION } from './sdk'

/** The metadata of a view, fields in manifest order (absent fields stay absent). */
export function viewMetadataOf(view: DefinedView): ViewMetadata {
  return {
    id: view.id,
    title: view.title,
    description: view.description,
    inputs: view.inputs,
    settings: view.settings,
    size: view.size,
    suits: view.suits,
  }
}

/** `manifest.json` for view modules (module paths relative to the manifest). */
export function manifestOf(views: readonly { module: string; view: DefinedView }[]): ViewManifest {
  return {
    sdk: VIEW_SDK_VERSION,
    views: views.map(({ module, view }): ViewManifestEntry => {
      const { id, title, description, ...rest } = viewMetadataOf(view)
      return { id, title, description, module, ...rest }
    }),
  }
}

const SETTING_TYPES = ['number', 'string', 'boolean']
const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** What is wrong with a view module's default export ([] when it keeps the contract). */
export function viewDefinitionProblems(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['the default export is not a view object']
  const view = value as Record<string, unknown>
  const problems: string[] = []
  if (view.sdk !== VIEW_SDK_VERSION) problems.push(`sdk is ${JSON.stringify(view.sdk)}, expected ${VIEW_SDK_VERSION}`)
  if (typeof view.mount !== 'function') problems.push('mount is not a function')
  if (!isText(view.id) || view.id.indexOf('/') >= 0) problems.push('id must be a non-empty string without "/"')
  for (const key of ['title', 'description'] as const) {
    if (view[key] !== undefined && typeof view[key] !== 'string') problems.push(`${key} must be a string`)
  }
  if (!Array.isArray(view.inputs)) {
    problems.push('inputs must be an array')
  } else {
    const names = new Set<string>()
    view.inputs.forEach((input: Record<string, unknown>, i) => {
      if (!input || !isText(input.name)) problems.push(`inputs[${i}].name must be a non-empty string`)
      else if (names.has(input.name)) problems.push(`input "${input.name}" is declared twice`)
      else names.add(input.name)
      if (!input || !Array.isArray(input.accepts) || input.accepts.length === 0 || !input.accepts.every(isText)) {
        problems.push(`inputs[${i}].accepts must be a non-empty array of types`)
      }
    })
  }
  if (view.settings !== undefined) {
    if (!view.settings || typeof view.settings !== 'object') problems.push('settings must be an object')
    else
      for (const [name, raw] of Object.entries(view.settings as Record<string, Record<string, unknown>>)) {
        const where = `setting "${name}"`
        if (!raw || !SETTING_TYPES.includes(raw.type as string)) {
          problems.push(`${where}: type must be one of ${SETTING_TYPES.join(', ')}`)
          continue
        }
        if (raw.default !== undefined && typeof raw.default !== raw.type) problems.push(`${where}: default must be a ${raw.type}`)
        if (raw.enum !== undefined) {
          if (raw.type !== 'string' || !Array.isArray(raw.enum) || !raw.enum.every(isText)) problems.push(`${where}: enum must list strings of a string setting`)
          else if (raw.default !== undefined && !raw.enum.includes(raw.default as string)) problems.push(`${where}: default is not in enum`)
        }
        for (const bound of ['min', 'max'] as const) {
          if (raw[bound] === undefined) continue
          if (raw.type !== 'number' || !isFiniteNumber(raw[bound])) problems.push(`${where}: ${bound} must be a number of a number setting`)
        }
        if (isFiniteNumber(raw.min) && isFiniteNumber(raw.max) && raw.min > raw.max) problems.push(`${where}: min is above max`)
        if (isFiniteNumber(raw.default)) {
          if ((isFiniteNumber(raw.min) && raw.default < raw.min) || (isFiniteNumber(raw.max) && raw.default > raw.max)) {
            problems.push(`${where}: default is outside min..max`)
          }
        }
      }
  }
  if (view.size !== undefined) {
    const size = view.size as Record<string, unknown> | null
    if (!size || !isFiniteNumber(size.width) || !isFiniteNumber(size.height)) problems.push('size must be { width, height } in px')
  }
  if (view.suits !== undefined) {
    if (!Array.isArray(view.suits)) problems.push('suits must be an array')
    else
      view.suits.forEach((suit: Record<string, unknown>, i) => {
        if (!suit || !isText(suit.node) || !isText(suit.port)) problems.push(`suits[${i}] must be { node, port }`)
      })
  }
  return problems
}
