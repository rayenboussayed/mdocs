/**
 * Unit tests for src/pool.ts — the concurrency limiter.
 */
import { setTimeout as delay } from 'node:timers/promises'
import { expect, test } from 'vitest'

import { mapPool } from './pool.js'

test('mapPool: sequential when limit is 1', async () => {
  let active = 0
  let maxActive = 0
  const input = Array.from({ length: 8 }, (_, i) => i)
  const results = await mapPool(input, 1, async (item) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await delay(5)
    active -= 1
    return item * 10
  })
  expect(results).toEqual(input.map((i) => i * 10))
  expect(maxActive).toBe(1)
})

test('mapPool: respects the concurrency limit', async () => {
  let active = 0
  let maxActive = 0
  const input = Array.from({ length: 12 }, (_, i) => i)
  await mapPool(input, 3, async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await delay(10)
    active -= 1
  })
  expect(maxActive).toBe(3)
})

test('mapPool: preserves input order in results', async () => {
  const input = [30, 10, 20, 5, 25]
  const results = await mapPool(input, 4, async (item) => {
    await delay(item) // later items finish first
    return item
  })
  expect(results).toEqual([30, 10, 20, 5, 25])
})

test('mapPool: empty input resolves to an empty array', async () => {
  expect(await mapPool([], 4, async () => 1)).toEqual([])
})

test('mapPool: a rejected task aborts the pool', async () => {
  const input = [1, 2, 3, 4]
  await expect(
    mapPool(input, 2, async (item) => {
      if (item === 2) throw new Error('boom')
      await delay(20)
      return item
    }),
  ).rejects.toThrow(/boom/)
})
