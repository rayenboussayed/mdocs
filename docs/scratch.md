<a name="withScratch"></a>

## withScratch(fn) ⇒ <code>Promise&lt;T&gt;</code>
Runs `fn` with a temporary scratch directory, removing it afterwards no
matter how `fn` exits.

**Kind**: global function  
**Returns**: <code>Promise&lt;T&gt;</code> - The value returned by `fn`.  

| Param | Type | Description |
| --- | --- | --- |
| fn | <code>(scratch: Scratch) &#x3D;&gt; Promise&lt;T&gt;</code> | The work to run with the scratch directory. |

src: src/scratch.ts:27  
dist: dist/scratch.js:20
