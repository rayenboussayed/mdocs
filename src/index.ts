/**
 * Public programmatic API for mdocs.
 *
 * ```js
 * import { run, defineConfig } from 'mdocs'
 *
 * export default defineConfig({ rootSrcDir: ['packages/<pkg>/src'] })
 * ```
 */
export { DEFAULT_CONFIG, defineConfig, loadConfig, resolveConfig } from './config.js'
export type { ConfigEnv, MdocsConfig, MdocsConfigExport, ResolvedMdocsConfig } from './config.js'

export { isMdocsError, MdocsError } from './errors.js'

export { run } from './run.js'
export type { ProjectSummary, RunOptions, RunResult } from './run.js'
