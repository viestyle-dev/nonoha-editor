#!/usr/bin/env node
// Build or compare static/views/manifest.json from the view modules in a folder.
//
//   nonoha-view-manifest [--write] <views folder>...
//
// Every .js file in a folder is a view module (plain ES module, no imports,
// default export = the view). Without --write the existing manifest.json is
// compared with the modules and the exit code is 1 on any difference or
// contract problem; with --write the manifest is written from the modules.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const write = args.includes('--write')
const folders = args.filter(a => a !== '--write')
if (folders.length === 0 || args.some(a => a.startsWith('-') && a !== '--write')) {
  console.error('usage: nonoha-view-manifest [--write] <views folder>...')
  process.exit(2)
}

// The manifest rules live in src/manifest.ts; bundle it on the fly so the
// tool always matches the source without a build.
const { build } = await import('esbuild')
const here = path.dirname(fileURLToPath(import.meta.url))
const bundled = await build({
  entryPoints: [path.join(here, '../src/manifest.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
})
const toDataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const { manifestOf, viewDefinitionProblems } = await import(toDataUrl(bundled.outputFiles[0].text))

const textOf = manifest => JSON.stringify(manifest, null, 2) + '\n'

/** Fields of each view that differ between two manifests. */
function differences(current, wanted) {
  const out = []
  if (current?.sdk !== wanted.sdk) out.push(`sdk: ${JSON.stringify(current?.sdk)} -> ${wanted.sdk}`)
  for (const key of Object.keys(current ?? {})) if (!(key in wanted)) out.push(`${key}: not part of the manifest`)
  const byId = new Map((Array.isArray(current?.views) ? current.views : []).map(v => [v?.id, v]))
  for (const view of wanted.views) {
    const old = byId.get(view.id)
    byId.delete(view.id)
    if (!old) {
      out.push(`${view.id}: missing from manifest.json`)
      continue
    }
    const keys = new Set([...Object.keys(old), ...Object.keys(view)])
    const changed = [...keys].filter(k => JSON.stringify(old[k]) !== JSON.stringify(view[k]))
    if (changed.length) out.push(`${view.id}: ${changed.join(', ')} differ`)
  }
  for (const id of byId.keys()) out.push(`${id}: in manifest.json but no module has it`)
  if (out.length === 0) out.push('order or formatting differs')
  return out
}

let failed = false
for (const folder of folders) {
  const dir = path.resolve(folder)
  const problems = []
  const views = []
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort() : null
  if (!files) problems.push('folder not found')
  const ids = new Set()
  for (const file of files ?? []) {
    let view
    try {
      view = (await import(toDataUrl(fs.readFileSync(path.join(dir, file), 'utf8')))).default
    } catch (error) {
      problems.push(`${file}: cannot be loaded as a module without imports (${error.message})`)
      continue
    }
    const found = viewDefinitionProblems(view)
    if (found.length === 0 && ids.has(view.id)) found.push(`id "${view.id}" is used by another module`)
    if (found.length) {
      problems.push(...found.map(p => `${file}: ${p}`))
      continue
    }
    ids.add(view.id)
    views.push({ module: file, view })
  }
  const manifestPath = path.join(dir, 'manifest.json')
  if (problems.length === 0) {
    const manifest = manifestOf(views)
    const text = textOf(manifest)
    const existing = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n') : null
    if (write) {
      if (existing !== text) fs.writeFileSync(manifestPath, text)
      console.log(`${existing === text ? 'unchanged' : 'wrote'} ${manifestPath} (${views.map(v => v.view.id).join(', ')})`)
    } else if (existing === null) {
      problems.push('manifest.json is missing (run with --write)')
    } else if (existing !== text) {
      let current = null
      try {
        current = JSON.parse(existing)
      } catch {
        problems.push('manifest.json is not valid JSON')
      }
      if (current) problems.push(...differences(current, manifest).map(d => `manifest.json: ${d} (run with --write)`))
    } else {
      console.log(`ok ${manifestPath} (${views.map(v => v.view.id).join(', ')})`)
    }
  }
  if (problems.length) {
    failed = true
    console.error(`${dir}:`)
    for (const p of problems) console.error(`  ${p}`)
  }
}
process.exit(failed ? 1 : 0)
