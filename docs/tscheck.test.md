<a name="lookup"></a>

## lookup(program, file, name, qualified) ⇒ <code>import(&quot;./tscheck.js&quot;).SymbolType</code>
Looks up `name` (optionally qualified) in `file` of the shared program.

**Kind**: global function  
**Returns**: <code>import(&quot;./tscheck.js&quot;).SymbolType</code> - The extracted types, or `null`.  

| Param | Type | Description |
| --- | --- | --- |
| program | <code>import(&quot;./tscheck.js&quot;).TypeProgram</code> | The shared type program under test. |
| file | <code>string</code> | Absolute path of the fixture source. |
| name | <code>string</code> | The plain symbol name to look up. |
| qualified | <code>string</code> | The qualified lookup key (overrides the plain one). |

src: src/tscheck.test.ts:23  
dist: dist/tscheck.test.js:20 (approx.)
