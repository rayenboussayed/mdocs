/**
 * Public programmatic API for mdaics.
 *
 * ```js
 * import { run, defineConfig } from 'mdaics'
 *
 * export default defineConfig({ rootSrcDir: ['packages/<pkg>/src'] })
 * ```
 */
export { DEFAULT_CONFIG, defineConfig, loadConfig, resolveConfig } from './config.js'
export type { ConfigEnv, MdaicsConfig, MdaicsConfigExport, ResolvedMdaicsConfig } from './config.js'

export { isMdaicsError, MdaicsError } from './errors.js'

export { run } from './run.js'
export type { ProjectSummary, RunOptions, RunResult } from './run.js'
