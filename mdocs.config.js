/**
 * Dogfooding config for mdocs itself: point the CLI at this repository's
 * source tree and produce the markdown API docs in `docs/` (gitignored).
 *
 * Regenerate with `node dist/cli.js` from the repository root — the same
 * command the AGENTS.md conventions document. The build (`npm run build`)
 * must run first; the import below resolves against `./dist`.
 */
import { defineConfig } from './dist/index.js'

export default defineConfig({
  rootSrcDir: 'src',
  rootDistDir: 'dist',
  outDirName: 'docs',
  parallelism: true,
})
