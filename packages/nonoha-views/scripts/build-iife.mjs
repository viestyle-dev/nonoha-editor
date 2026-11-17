// Builds dist/nonoha-views.iife.js (global NonohaViews) for apps without a
// bundler. nonoha-views imports only types from nonoha-client-js, so no
// client code ends up in it: apps load nonoha-client.iife.js next to it.
// The banner names the version and the view SDK.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const sdk = /export const VIEW_SDK_VERSION = (\d+)/.exec(readFileSync(new URL('../src/sdk.ts', import.meta.url), 'utf8'))[1]

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'NonohaViews',
  outfile: 'dist/nonoha-views.iife.js',
  target: 'es2020',
  banner: { js: `/*! ${pkg.name} ${pkg.version} (view SDK ${sdk}) | Apache-2.0 */` },
})
