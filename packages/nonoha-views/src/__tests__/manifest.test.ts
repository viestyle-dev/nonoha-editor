import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { manifestOf, viewDefinitionProblems, viewMetadataOf } from '../manifest'
import { defineView } from '../sdk'

const view = defineView({
  id: 'level',
  description: 'A level',
  inputs: [{ name: 'values', accepts: ['f32[?]'] }],
  settings: { gain: { type: 'number', default: 1, min: 0, max: 10 } },
  suits: [{ node: 'Meter', port: 'out' }],
  mount() {},
})

describe('manifestOf', () => {
  it('takes every field from the definitions, in manifest order', () => {
    const manifest = manifestOf([{ module: 'level.js', view }])
    expect(manifest.sdk).toBe(1)
    expect(Object.keys(manifest.views[0])).toEqual(['id', 'title', 'description', 'module', 'inputs', 'settings', 'size', 'suits'])
    expect(JSON.parse(JSON.stringify(manifest.views[0]))).toEqual({
      id: 'level',
      description: 'A level',
      module: 'level.js',
      inputs: view.inputs,
      settings: view.settings,
      suits: view.suits,
    })
    expect(viewMetadataOf(view)).not.toHaveProperty('mount')
  })
})

describe('viewDefinitionProblems', () => {
  it('accepts a view that keeps the contract', () => {
    expect(viewDefinitionProblems(view)).toEqual([])
  })

  it('names what breaks the contract', () => {
    const problems = viewDefinitionProblems({
      sdk: 2,
      id: 'a/b',
      inputs: [{ name: 'x', accepts: [] }, { name: 'x', accepts: ['f32'], delivery: 'some' }],
      settings: {
        a: { type: 'color' },
        b: { type: 'number', default: 'one', min: 5, max: 1 },
        c: { type: 'string', enum: ['x'], default: 'y' },
        d: { type: 'boolean', min: 0 },
      },
      suits: [{ node: 'N' }],
    })
    expect(problems).toEqual([
      'sdk is 2, expected 1',
      'mount is not a function',
      'id must be a non-empty string without "/"',
      'inputs[0].accepts must be a non-empty array of types',
      'input "x" is declared twice',
      'inputs[1].delivery must be "every" or "latest"',
      'setting "a": type must be one of number, string, boolean',
      'setting "b": default must be a number',
      'setting "b": min is above max',
      'setting "c": default is not in enum',
      'setting "d": min must be a number of a number setting',
      'suits[0] must be { node, port }',
    ])
    expect(viewDefinitionProblems(null)).toEqual(['the default export is not a view object'])
  })
})

describe('bin/view-manifest.mjs', () => {
  const bin = path.resolve(__dirname, '../../bin/view-manifest.mjs')
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  const viewsFolder = (files: Record<string, string>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonoha-views-test-'))
    dirs.push(dir)
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text)
    return dir
  }
  const run = (...args: string[]) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [bin, ...args], { encoding: 'utf8', stdio: 'pipe' }) }
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string }
      return { code: e.status, out: e.stdout + e.stderr }
    }
  }
  const viewModule = (suits: string) =>
    `export default { sdk: 1, id: "level", inputs: [{ name: "values", accepts: ["f32[?]"] }], suits: ${suits}, mount() {} }\n`

  it('writes the manifest, then finds it up to date', () => {
    const dir = viewsFolder({ 'level.js': viewModule('[{ node: "Meter", port: "out" }]') })
    expect(run(dir).code).toBe(1) // no manifest yet
    expect(run('--write', dir).code).toBe(0)
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    expect(written.views[0]).toMatchObject({ id: 'level', module: 'level.js', suits: [{ node: 'Meter', port: 'out' }] })
    expect(run(dir)).toMatchObject({ code: 0 })
  }, 20000)

  it('fails on a manifest that differs from the modules, naming the fields', () => {
    const dir = viewsFolder({ 'level.js': viewModule('[]') })
    run('--write', dir)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    manifest.portHints = []
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
    fs.writeFileSync(path.join(dir, 'level.js'), viewModule('[{ node: "Meter", port: "out" }]'))
    const result = run(dir)
    expect(result.code).toBe(1)
    expect(result.out).toMatch(/portHints: not part of the manifest/)
    expect(result.out).toMatch(/level: suits differ/)
  }, 20000)

  it('fails on modules that break the contract', () => {
    const dir = viewsFolder({ 'bad.js': 'export default { sdk: 1, id: "bad", mount() {} }\n' })
    const result = run('--write', dir)
    expect(result.code).toBe(1)
    expect(result.out).toMatch(/bad\.js: inputs must be an array/)
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(false)
  }, 20000)
})
