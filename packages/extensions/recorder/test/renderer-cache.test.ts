import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createRendererCache} from '../src/server/renderer-cache.js'
import type {KeyframeRenderer} from '../src/server/render.js'

const fakeRenderer = (): KeyframeRenderer => ({
  render: async () => [],
  renderVideo: async () => null,
  dispose: async () => {},
})

describe('renderer cache', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retries after a null (crashed/missing) launch instead of caching it forever', async () => {
    const launches: (KeyframeRenderer | null)[] = [null, fakeRenderer()]
    const cache = createRendererCache(async () => launches.shift() ?? null)
    expect(await cache.use(async () => 'used')).toBeNull()
    expect(await cache.use(async () => 'used')).toBe('used')
  })

  it('reuses a live renderer, disposes it after idle, relaunches on next use', async () => {
    let launched = 0
    const cache = createRendererCache(async () => {
      launched += 1
      return fakeRenderer()
    })
    await cache.use(async () => 'used')
    await cache.use(async () => 'used')
    expect(launched).toBe(1)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1)
    await cache.use(async () => 'used')
    expect(launched).toBe(2)
  })

  it('does not dispose the renderer while a long render still holds it', async () => {
    let disposed = 0
    const cache = createRendererCache(async () => ({
      render: async () => [],
      renderVideo: async () => null,
      dispose: async () => {
        disposed += 1
      },
    }))
    const pending = cache.use(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30_000)
      return 'done'
    })
    expect(await pending).toBe('done')
    expect(disposed).toBe(0)
  })
})
