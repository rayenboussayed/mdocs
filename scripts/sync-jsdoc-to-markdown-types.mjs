/**
 * Extracts type declarations for `jsdoc-to-markdown` DIRECTLY from the
 * installed package — no type is written by hand anywhere in this flow.
 *
 * Why this exists: jsdoc-to-markdown ships no .d.ts, and the published
 * `@types/jsdoc-to-markdown` describes the v7 named-export API, not the v9
 * default-export instance. The package's JSDoc is written for humans, so
 * two entries in it are unrepresentable for TypeScript's declaration
 * inference and are patched mechanically below:
 *
 *   1. Hyphenated option names (`options.heading-depth`, `options.no-cache`)
 *      cannot be emitted as quoted properties — tsc silently drops or
 *      mangles them. render() is documented upstream as
 *      taking `options {object}`; we delete those unrepresentable `@param`
 *      lines (inside the render block only) so the emit widens to
 *      `options?: object`, the same shape the sibling methods already have.
 *   2. `getNamepaths` is async but documented as `@returns {object}`; the
 *      emit must be `Promise<object>` for callers awaiting it.
 *
 * Anything else changes nothing — if upstream's JSDoc changes in a way that
 * breaks these patterns, the script fails loudly rather than emitting a lie.
 * Nothing is imported or executed; the file is only parsed.
 *
 * Re-run after dependency bumps: `npm run types:sync`
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = join(repoRoot, 'node_modules', 'jsdoc-to-markdown')
const pkgVersion = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version

let source = readFileSync(join(pkgDir, 'index.js'), 'utf8')

// --- Patch 2 (single occurrence, verified) --------------------------------
const GETNAMEPATHS_RETURNS = '@returns {object}'
if (!source.includes(GETNAMEPATHS_RETURNS)) {
  throw new Error('patch anchor not found: getNamepaths @returns {object} — upstream JSDoc changed; review this script')
}
source = source.replace(GETNAMEPATHS_RETURNS, '@returns {Promise<object>}')

// --- Patch 1: delete render()'s `@param [options.x]` lines ----------------
const renderStart = source.indexOf('Returns markdown documentation')
const renderEnd = source.indexOf('async render', renderStart)
if (renderStart === -1 || renderEnd === -1) {
  throw new Error('render JSDoc block not found — upstream JSDoc changed; review this script')
}
const renderBlock = source.slice(renderStart, renderEnd)
const renderBody = renderBlock
  .split('\n')
  .filter((line) => !/^\s*\* @param \[options\./.test(line))
  .join('\n')
source = source.slice(0, renderStart) + renderBody + source.slice(renderEnd)

// --- Stage the patched copy and emit declarations from it -----------------
const scratch = mkdtempSync(join(tmpdir(), 'mdaics-types-'))
try {
  const staged = join(scratch, 'index.js')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- scratch is a fresh mkdtemp dir created by this script; the path is joined, not user input
  writeFileSync(staged, source, { encoding: 'utf8', mode: 0o600 })
  const outDir = join(scratch, 'out')
  execFileSync(
    process.execPath,
    [
      join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--ignoreConfig',
      '--allowJs',
      '--declaration',
      '--emitDeclarationOnly',
      '--skipLibCheck',
      '--module', 'nodenext',
      '--moduleResolution', 'nodenext',
      '--target', 'es2024',
      '--outDir', outDir,
      staged,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reading the file this script just emitted inside its own mkdtemp scratch dir
  const emitted = readFileSync(join(outDir, 'index.d.ts'), 'utf8')
  const header = `/**
 * GENERATED from jsdoc-to-markdown@${pkgVersion} — do not edit by hand.
 * Regenerate after dependency bumps: \`npm run types:sync\`
 * (see scripts/sync-jsdoc-to-markdown-types.mjs for the two mechanical patches).
 */
declare module 'jsdoc-to-markdown' {
`
  writeFileSync(
    join(repoRoot, 'src', 'types', 'jsdoc-to-markdown.d.ts'),
    header + emitted + '}\n',
    'utf8',
  )
  console.info(`extracted src/types/jsdoc-to-markdown.d.ts from jsdoc-to-markdown@${pkgVersion}`)
} finally {
  rmSync(scratch, { force: true, recursive: true })
}
