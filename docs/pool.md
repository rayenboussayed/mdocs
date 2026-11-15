<a name="mapPool"></a>

## mapPool(items, limit, fn) ⇒ <code>Promise&lt;R[]&gt;</code>
Maps `items` through `fn` with at most `limit` promises in flight, preserving
input order in the results array.

`fn` is expected to handle its own errors (e.g. by returning a result object
instead of throwing) when the caller wants per-item failure collection rather
than abort-on-first-error semantics. If `fn` throws, the whole batch is
abandoned: remaining items never run and results are discarded.

**Kind**: global function  
**Returns**: <code>Promise&lt;R[]&gt;</code> - The task results, in the same order as `items`.  

| Param | Type | Description |
| --- | --- | --- |
| items | <code>readonly T[]</code> | The work items, read in order. |
| limit | <code>number</code> | Maximum number of concurrent `fn` invocations. |
| fn | <code>(item: T, index: number) &#x3D;&gt; Promise&lt;R&gt;</code> | The async task applied to each item. |

src: src/pool.ts:14  
dist: dist/pool.js:14
