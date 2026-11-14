/**
 * Configuration loading and validation for `mdocs`.
 *
 * Loading follows the vite convention: `mdocs.config.{js,mjs,cjs}` in the
 * working directory (or an explicit `--config <path>`), supporting both
 * `export default …` and `module.exports = …`, optionally with a function
 * form (`defineConfig(env => config)`). Use `defineConfig` for typed
 * authoring — it is an identity function, exactly like vite's.
 *
 * Loader selection: `.mjs` is imported, `.cjs` is required, `.js` defers to
 * the nearest `package.json` `"type"` (`module` → import; `commonjs`/absent →
 * `require`, with a sibling `.mjs` copy as fallback for ESM-in-CJS cases
 * Node's `require(esm)` rejects).
 *
 * Security note: the config file is arbitrary JavaScript executed in-process
 * (like every vite/webpack config). Only run `mdocs` on projects you trust.
 * There is intentionally no sandboxing and no network access in the loader.
 */
import { randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { readFileSync } from 'node:fs'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { availableParallelism } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { errorMessage, isMdocsError, MdocsError } from './errors.js'
import { type MdocsConfigInput, parseMdocsConfig, parseProcessEnv } from './schema.js'

/**
 * User-facing configuration object (all keys optional — see `DEFAULT_CONFIG`;
 * each key is validated by the zod schema in `schema.js`).
 */
export type MdocsConfig = MdocsConfigInput

/** Validated, fully-resolved configuration used by the pipeline. */
export interface ResolvedMdocsConfig {
  /** Plain directory name for the generated docs. */
  outDirName: string
  /** Concrete worker count (`>= 1`). */
  parallelism: number
  /** Plain directory name for the build output. */
  rootDistDir: string
  /** Absolute or `cwd`-relative roots, exactly as provided (globs intact). */
  rootSrcDir: string[]
}

/** Default values for every configuration key. */
export const DEFAULT_CONFIG = {
  outDirName: 'docs',
  parallelism: true,
  rootDistDir: 'dist',
  rootSrcDir: ['src'],
} as const

/** Environment passed to the function form of the config. */
export interface ConfigEnv {
  /** Always `'build'` — mdocs generates artifacts. */
  command: 'build'
  /** `NODE_ENV` or `'production'`. */
  mode: string
}

/**
 * What a config file may export: the object itself, a promise of it, or a
 * function (sync or async) receiving `ConfigEnv`.
 */
export type MdocsConfigExport =
  | ((env: ConfigEnv) => MdocsConfig | Promise<MdocsConfig>)
  | MdocsConfig
  | Promise<MdocsConfig>

/**
 * Identity helper for typed configs, mirroring vite's `defineConfig`:
 * `export default defineConfig({ … })`. Purely an authoring aid — validation
 * happens in `resolveConfig`, after the config is loaded.
 * @param config - The typed config object, function, or promise of either.
 * @returns The config export, unchanged.
 */
export function defineConfig(config: MdocsConfigExport): MdocsConfigExport {
  return config
}

const CONFIG_FILE_NAMES = ['mdocs.config.js', 'mdocs.config.mjs', 'mdocs.config.cjs'] as const

/**
 * Locates, loads, evaluates and validates the config file for `cwd`.
 *
 * When no config file exists and no explicit path was given, the run falls
 * back to the default configuration (vite behavior) and `filePath` is
 * `undefined`. An explicit `--config` path that does not exist always
 * throws.
 *
 * `overrides` (config keys provided out-of-band, e.g. CLI flags or a
 * programmatic call) are merged over the file's config — an override always
 * wins for its own key, everything else comes from the file.
 * @param cwd - Working directory for config lookup and relative roots.
 * @param explicitPath - Explicit `--config` path (beats auto-discovery).
 * @param overrides - Config keys merged over the file's config.
 * @returns The resolved config and the file (if any) it came from.
 */
export async function loadConfig(
  cwd: string,
  explicitPath?: string,
  overrides?: MdocsConfig,
): Promise<{ config: ResolvedMdocsConfig; filePath: string | undefined }> {
  const filePath = await locateConfigFile(cwd, explicitPath)
  // One choke point for everything the config module or its export-shape
  // handling can throw: raw library/runtime errors are wrapped in
  // CONFIG_LOAD_FAILED; errors that are already MdocsErrors pass through.
  let raw: unknown
  if (filePath === undefined) {
    raw = {}
  } else {
    try {
      raw = await evaluateConfigExport(await importConfigModule(filePath), filePath)
    } catch (error) {
      if (isMdocsError(error)) throw error
      throw configLoadError(filePath, error)
    }
  }
  const merged = overrides === undefined ? raw : { ...(raw as Record<string, unknown>), ...definedOverrides(overrides) }
  return { config: resolveConfig(merged), filePath }
}

/**
 * Resolves and validates a user-facing config into a `ResolvedMdocsConfig`.
 * @param raw - The user-facing (unvalidated) config.
 * @returns The frozen, fully-resolved config.
 */
export function resolveConfig(raw: unknown): ResolvedMdocsConfig {
  // Shape and key validation live in parseMdocsConfig — the single validation root.
  const input = parseMdocsConfig(raw)
  return Object.freeze({
    outDirName: input.outDirName ?? DEFAULT_CONFIG.outDirName,
    parallelism: resolveParallelism(input.parallelism),
    rootDistDir: input.rootDistDir ?? DEFAULT_CONFIG.rootDistDir,
    rootSrcDir: normalizeRootSrcDir(input.rootSrcDir),
  })
}

/**
 * Wraps config-loading failures with a consistent code and message.
 * @param filePath - The config file that failed to load.
 * @param cause - The underlying error.
 * @returns A `MdocsError` with code `CONFIG_LOAD_FAILED`.
 */
function configLoadError(filePath: string, cause: unknown): MdocsError {
  const reason = errorMessage(cause)
  return new MdocsError('CONFIG_LOAD_FAILED', `failed to load config ${filePath}: ${reason}`, { cause })
}

/**
 * Keeps only the keys of `overrides` that are actually set.
 * @param overrides - The user-facing config overrides (any keys missing are kept unset).
 * @returns The overrides with only the set keys.
 */
function definedOverrides(overrides: MdocsConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(overrides)) {
    // eslint-disable-next-line security/detect-object-injection -- key is a literal from the allow-list above; out is a plain Record
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * Human-readable description of a value's runtime type.
 * @param value - The value to describe.
 * @returns `null`, `an array`, or the `typeof` string.
 */
function describeType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Resolves the exported value, calling the function form if present.
 * Promise exports are resolved transparently: `await` assimilates thenables,
 * so by the time the value gets here any promise layers have already settled.
 * @param exported - The raw module export to resolve.
 * @param filePath - The config file it came from (for errors).
 * @returns The resolved plain-object config.
 */
async function evaluateConfigExport(exported: unknown, filePath: string): Promise<unknown> {
  let value: unknown = exported
  // Native ESM import yields a module namespace whose `default` holds the
  // default export (and whose named exports are also valid config keys).
  // Raw `.cjs` exports (createRequire) are used as-is, even if they have a
  // `default` property.
  if (isModuleNamespace(value)) {
    const namespace = value as Record<string, unknown>
    value = 'default' in namespace ? namespace['default'] : namespace
  }
  if (typeof value === 'function') {
    const env: ConfigEnv = { command: 'build', mode: parseProcessEnv(process.env).nodeEnv ?? 'production' }
    value = await (value as (env: ConfigEnv) => unknown)(env)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MdocsError(
      'INVALID_CONFIG',
      `config in ${filePath} must export a plain object (or a function returning one), received ${describeType(value)}`,
    )
  }
  return value
}

/**
 * Imports a config module, choosing the loader the same way vite and Node do:
 *
 * | file        | loader                                                    |
 * | ----------- | -------------------------------------------------------- |
 * | `.mjs`      | ESM always                                                |
 * | `.cjs`      | `require` (never silently reinterpreted)                  |
 * | `.js` + `"type": "module"`                       | ESM always        |
 * | `.js` + `"type": "commonjs"` or no `package.json` | `require` first,  |
 * |             | falling back to a sibling `.mjs` copy only for ESM-in-CJS |
 *
 * `require()` of an ESM `.js` file fails with a plain `SyntaxError` on current
 * Node versions, so `.js` ESM configs in `"type": "commonjs"` packages load
 * through the fallback, not through `require(esm)`.
 * @param filePath - The config file to import.
 * @returns The module export (namespace object for ESM, as-is for CJS).
 */
async function importConfigModule(filePath: string): Promise<unknown> {
  const ext = extname(filePath).toLowerCase()
  // Cache-bust so repeated loads within one process see fresh content.
  const url = pathToFileURL(filePath)
  url.searchParams.set('t', String(Date.now()))

  if (ext === '.mjs') return import(url.href)
  if (ext === '.cjs') {
    try {
      return createRequire(filePath)(filePath)
    } catch (error) {
      throw configLoadError(filePath, error)
    }
  }
  if (ext === '.js') {
    const type = nearestPackageType(filePath)
    if (type === 'module') return import(url.href)
    try {
      return createRequire(filePath)(filePath)
    } catch (error) {
      if (!isEsmInCjsError(error)) throw configLoadError(filePath, error)
      return importEsmInCommonJsPackage(filePath)
    }
  }
  throw new MdocsError('CONFIG_NOT_FOUND', `unsupported config extension "${ext}" for ${filePath} (expected .js, .mjs or .cjs)`)
}

/**
 * Imports ESM config living in a `.js` file of a CommonJS-typed package.
 * The copy is written **next to the config file** — so relative imports in
 * the config keep working — with a hidden, unique name, removed afterwards.
 * @param filePath - The `.js` config file whose ESM-in-CJS content is loaded.
 * @returns The module export.
 */
async function importEsmInCommonJsPackage(filePath: string): Promise<unknown> {
  const scratchFile = join(dirname(filePath), `.${basename(filePath)}.mdocs-${process.pid}-${randomBytes(4).toString('hex')}.mjs`)
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
    await writeFile(scratchFile, await readFile(filePath), { flag: 'wx', mode: 0o600 })
    return await import(pathToFileURL(scratchFile).href)
  } catch (error) {
    throw new MdocsError(
      'CONFIG_LOAD_FAILED',
      `failed to load config ${filePath}: ${error instanceof Error ? error.message : String(error)}\n` +
        'hint: rename the file to mdocs.config.mjs or set "type": "module" in package.json',
      { cause: error },
    )
  } finally {
    /* v8 ignore next 1 — rm with force practically never fails; the try exists so temp files never leak on error. */
    await rm(scratchFile, { force: true }).catch(() => undefined)
  }
}

/**
 * True when `error` reports ESM syntax loaded as CommonJS (Node-version-dependent).
 * @param error - The catch value to classify.
 * @returns Whether the error is an ESM-in-CJS load failure.
 */
function isEsmInCjsError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  /* v8 ignore next 1 — ERR_REQUIRE_ESM/ERR_REQUIRE_ASYNC_MODULE are thrown only on older Node minors; current Node raises Unexpected-token SyntaxErrors. */
  if (code === 'ERR_REQUIRE_ESM' || code === 'ERR_REQUIRE_ASYNC_MODULE') return true
  if (!(error instanceof SyntaxError)) return false
  return /Cannot use import statement|Cannot use 'import\.meta'|Unexpected token 'export'|await is only valid in async functions|import\.meta/i.test(
    error.message,
  )
}

/**
 * Detects a native ESM module namespace exotic object.
 * @param value - The value to test.
 * @returns `true` for a native ESM module namespace object.
 */
function isModuleNamespace(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === '[object Module]'
}

/**
 * Finds the config file to use, honoring an explicit `--config` override.
 * @param cwd - Working directory to look up config files in.
 * @param explicitPath - Explicit `--config` path (never auto-discovered).
 * @returns The absolute path, or `undefined` when none exists and none was given.
 */
async function locateConfigFile(cwd: string, explicitPath?: string): Promise<string | undefined> {
  if (explicitPath !== undefined) {
    const filePath = resolve(cwd, explicitPath)
    try {
      await access(filePath, fsConstants.R_OK)
    } catch {
      throw new MdocsError('CONFIG_NOT_FOUND', `config file not found or not readable: ${filePath}`)
    }
    return filePath
  }

  for (const name of CONFIG_FILE_NAMES) {
    const filePath = join(cwd, name)
    try {
      await access(filePath, fsConstants.R_OK)
      return filePath
    } catch {
      // Not readable here — keep searching.
      continue
    }
  }
  return undefined
}

/**
 * Nearest `package.json` `"type"` walking up from `filePath` (or undefined).
 * @param filePath - The config file to start from.
 * @returns `module`, `commonjs`, or `undefined` when no nearest `package.json` declares it.
 */
function nearestPackageType(filePath: string): 'commonjs' | 'module' | undefined {
  let dir = dirname(filePath)
  while (true) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the validated config / workspace root; no untrusted path
      const raw = readFileSync(join(dir, 'package.json'), 'utf8')
      const parsed = JSON.parse(raw) as { type?: unknown }
      if (parsed.type === 'module' || parsed.type === 'commonjs') return parsed.type
      return undefined
    } catch {
      const parent = dirname(dir)
      if (parent === dir) return undefined
      dir = parent
    }
  }
}

/**
 * Normalizes `rootSrcDir` to an array, applying the default when unset.
 * @param value - The user-facing `rootSrcDir` (string, array, or unset).
 * @returns The normalized array of roots.
 */
function normalizeRootSrcDir(value: string | string[] | undefined): string[] {
  if (value === undefined) return [...DEFAULT_CONFIG.rootSrcDir]
  return Array.isArray(value) ? value : [value]
}

/**
 * Resolves the effective worker count ("true" = all cores).
 * @param value - The user-facing `parallelism` (boolean, number, or unset).
 * @returns The concrete worker count.
 */
function resolveParallelism(value: boolean | number | undefined): number {
  if (value === undefined) return availableParallelism()
  if (typeof value === 'boolean') return value ? availableParallelism() : 1
  return value
}
