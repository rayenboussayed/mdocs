/**
 * GENERATED from jsdoc-to-markdown@9.1.3 — do not edit by hand.
 * Regenerate after dependency bumps: `npm run types:sync`
 * (see scripts/sync-jsdoc-to-markdown-types.mjs for the two mechanical patches).
 */
declare module 'jsdoc-to-markdown' {
declare const _default: JsdocToMarkdown;
export default _default;
/**
 * @module jsdoc-to-markdown
 * @example
 * import jsdoc2md from 'jsdoc-to-markdown'
 */
/**
 * @alias module:jsdoc-to-markdown
 * @typicalname jsdoc2md
*/
declare class JsdocToMarkdown {
    /**
     * Returns markdown documentation from jsdoc-annoted source code.
     *
     * @param [options] {object} - Accepts all {@link module:jsdoc-to-markdown#getJsdocData} options plus the following:
     * @return {Promise<string>}
     * @fulfil {string} - the rendered docs
     * @category async
     * @example
     * Pass in filepaths (`**` glob matching supported) of javascript source files:
     * ```js
     * > const apiDocs = await jsdoc2md.render({ files: 'lib/*.js' })
     * ```
     */
    render(options?: object): Promise<string>;
    /**
     * Returns the template data (jsdoc-parse output) which is fed into the output template (dmd).
     *
     * @param [options] {object} - Identical options to {@link module:jsdoc-to-markdown#getJsdocData}.
     * @return {Promise<object[]>}
     * @fulfil {object[]} - the json data
     * @category async
     */
    getTemplateData(options?: object): Promise<object[]>;
    /**
     * Returns raw data direct from the underlying [jsdoc3](https://github.com/jsdoc3/jsdoc).
     *
     * @param [options] {object} - the options
     * @param [options.no-cache] {boolean} - By default results are cached to speed up repeat invocations with the same input. Set to true to disable this.
     * @param [options.files] {string|string[]} - One or more filenames to process. Accepts globs (e.g. `*.js`). Either `files`, `source` or `configure` must be supplied.
     * @param [options.source] {string} - A string containing source code to process. One of `files`, `source` or `configure` must be supplied.
     * @param [options.configure] {string} - The path to the [jsdoc configuration file](https://jsdoc.app/about-configuring-jsdoc.html). Default: path/to/jsdoc/conf.json. One of `files`, `source` or `configure` must be supplied.
     * @return {Promise<object[]>}
     * @fulfil {object[]}
     * @category async
     */
    getJsdocData(options?: {
        no?: any;
        files?: string | string[] | undefined;
        source?: string | undefined;
        configure?: string | undefined;
    }): Promise<object[]>;
    /**
     * By default, the output of each invocation of the main generation methods (`render`, `getTemplateData` etc) is stored in the cache (your system's [temporary directory](https://nodejs.org/dist/latest-v6.x/docs/api/os.html#os_os_tmpdir)). Future jsdoc2md invocations with the same input options and source code will return the output immediately from cache, making the tool much faster/cheaper. If the input options or source code changes, fresh output will be generated. This method clears the cache, which you should never need to do unless the cache is failing for some reason. On Mac OSX, the system tmpdir clears itself every few days meaning your jsdoc2md cache will also be routinely cleared.
     * @returns {Promise}
     * @category async
     */
    clear(): Promise<any>;
    /**
     * Returns all [jsdoc namepaths](https://jsdoc.app/about-namepaths.html) found in the supplied source code.
     * @param {object} - options to pass to {@link module:jsdoc-to-markdown#getTemplateData}
     * @returns {Promise<object>}
     * @category async
     */
    getNamepaths(options: any): Promise<object>;
}
}
