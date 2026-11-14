/**
 * Type declarations for `jsdoc-to-markdown@9` (accurate) and `jsdoc-api@9`
 * (no official types exist).
 *
 * The published `@types/jsdoc-to-markdown` declares named function exports,
 * which does not match v9 — the package ships a single default export: an
 * instance of `JsdocToMarkdown`. These declarations are written against the
 * actual runtime shapes (see `jsdoc-to-markdown/index.js` and
 * `jsdoc-api/index.js` in node_modules).
 */

declare module 'jsdoc-to-markdown' {
  /** Options accepted by every jsdoc2md invocation path. */
  export interface JsdocOptions {
    /** dmd render options, passed through (`heading-depth`, `no-gfm`, …). */
    [option: string]: unknown
    configure?: string
    data?: object[]
    files?: StringList
    /** CommonJS handlebars helper files. */
    helper?: StringList
    'no-cache'?: boolean
    /** handlebars partial files registered on top of the dmd built-ins. */
    partial?: StringList
    source?: string
    /** handlebars template string replacing the default dmd template. */
    template?: string
  }

  export interface JsdocToMarkdownInstance {
    clear(): Promise<void>
    /** Returns the raw `jsdoc -X` doclets. */
    getJsdocData(options: JsdocOptions): Promise<object[]>
    getNamepaths(options: JsdocOptions): Promise<Record<string, object[]>>
    /** Returns the jsdoc-parse output fed into dmd's handlebars template. */
    getTemplateData(options: JsdocOptions): Promise<object[]>
    /** Renders markdown from files, source or pre-parsed template data. */
    render(options: JsdocOptions): Promise<string>
  }

  /** `string` or `string[]` — the option shape dmd uses for file lists. */
  type StringList = string | string[]

  const instance: JsdocToMarkdownInstance
  export default instance
}
