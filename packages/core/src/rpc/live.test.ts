import {describe, expect, it} from 'vitest'
import {makeLiveFeed} from './live.js'

async function nextTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('live feed', () => {
  it('wakes a subscriber per pulse batch and stops on abort', async () => {
    const feed = makeLiveFeed()
    const abort = new AbortController()
    const seen: number[] = []
    const consumer = (async () => {
      let n = 0
      for await (const _ of feed.subscribe(abort.signal)) {
        n += 1
        seen.push(n)
        if (n === 2) abort.abort()
      }
    })()
    await nextTick()
    feed.pulse()
    await nextTick()
    feed.pulse()
    feed.pulse()
    await nextTick()
    await consumer
    expect(seen).toEqual([1, 2])
  })

  it('does not lose a pulse that lands while the consumer is mid-emission', async () => {
    const feed = makeLiveFeed()
    const abort = new AbortController()
    const seen: number[] = []
    const consumer = (async () => {
      let n = 0
      for await (const _ of feed.subscribe(abort.signal)) {
        n += 1
        seen.push(n)
        if (n === 1) feed.pulse()
        if (n === 2) abort.abort()
      }
    })()
    await nextTick()
    feed.pulse()
    await nextTick()
    await nextTick()
    await consumer
    expect(seen).toEqual([1, 2])
  })

  it('removes the subscriber on abort', async () => {
    const feed = makeLiveFeed()
    const abort = new AbortController()
    const consumer = (async () => {
      for await (const _ of feed.subscribe(abort.signal)) {
        break
      }
    })()
    await nextTick()
    feed.pulse()
    await consumer
    abort.abort()
    await nextTick()
    expect(feed.size()).toBe(0)
  })
})
