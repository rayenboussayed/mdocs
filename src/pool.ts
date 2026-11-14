/**
 * Maps `items` through `fn` with at most `limit` promises in flight, preserving
 * input order in the results array.
 *
 * `fn` is expected to handle its own errors (e.g. by returning a result object
 * instead of throwing) when the caller wants per-item failure collection rather
 * than abort-on-first-error semantics. If `fn` throws, the whole batch is
 * abandoned: remaining items never run and results are discarded.
 * @param items - The work items, read in order.
 * @param limit - Maximum number of concurrent `fn` invocations.
 * @param fn - The async task applied to each item.
 * @returns The task results, in the same order as `items`.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const workerCount = Math.min(limit, items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    // `next` is a plain integer; each index is claimed exactly once because the
    // increment and the bounds check happen without an intervening await.
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      // eslint-disable-next-line security/detect-object-injection -- index < items.length is guaranteed by the loop bound
      const item = items[index] as T // safe: index < items.length
      // eslint-disable-next-line security/detect-object-injection -- results is pre-sized to items.length; every index written exactly once
      results[index] = await fn(item, index)
    }
  })

  await Promise.all(workers)
  return results
}
