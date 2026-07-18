import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createRendererCache} from '../src/server/renderer-cache.js'
import type {KeyframeRenderer} from '../src/server/render.js'

const fakeRenderer = (): KeyframeRenderer => ({render: async () => [], dispose: async () => {}})

describe('renderer cache', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retries after a null (crashed/missing) launch instead of caching it forever', async () => {
    const launches: (KeyframeRenderer | null)[] = [null, fakeRenderer()]
    const cache = createRendererCache(async () => launches.shift() ?? null)
    expect(await cache.get()).toBeNull()
    expect(await cache.get()).not.toBeNull()
  })

  it('reuses a live renderer, disposes it after idle, relaunches on next use', async () => {
    let launched = 0
    const cache = createRendererCache(async () => {
      launched += 1
      return fakeRenderer()
    })
    await cache.get()
    await cache.get()
    expect(launched).toBe(1)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1)
    await cache.get()
    expect(launched).toBe(2)
  })
})
