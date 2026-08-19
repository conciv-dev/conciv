import {describe, expect, it} from 'vitest'
import {makePageBus} from '../src/page-bus.js'

type CapturedFrame = {requestId: string; name: string}

function isCapturedFrame(value: unknown): value is CapturedFrame {
  return typeof value === 'object' && value !== null && 'requestId' in value && 'name' in value
}

describe('makePageBus scopes subscribers by session', () => {
  it('ask(A) reaches only the subscriber registered for session A', async () => {
    const bus = makePageBus(1_000)
    const seenByA: CapturedFrame[] = []
    const seenByB: CapturedFrame[] = []
    bus.subscribe('a', (frame) => {
      if (!isCapturedFrame(frame)) return
      seenByA.push(frame)
      queueMicrotask(() => bus.resolve(frame.requestId, {ok: true, result: {}}))
    })
    bus.subscribe('b', (frame) => {
      if (isCapturedFrame(frame)) seenByB.push(frame)
    })

    await bus.ask('a', {name: 'page.text', input: {}})

    expect(seenByA).toHaveLength(1)
    expect(seenByB).toHaveLength(0)
  })

  it('rejects with no-widget when no subscriber is registered for that session', async () => {
    const bus = makePageBus(1_000)
    bus.subscribe('other-session', () => {})

    await expect(bus.ask('missing-session', {name: 'page.text', input: {}})).rejects.toMatchObject({
      error: {code: 'no-widget'},
    })
  })

  it('a later subscription for the same session replaces the earlier one', async () => {
    const bus = makePageBus(1_000)
    const stale: CapturedFrame[] = []
    const fresh: CapturedFrame[] = []
    bus.subscribe('s1', (frame) => {
      if (isCapturedFrame(frame)) stale.push(frame)
    })
    bus.subscribe('s1', (frame) => {
      if (!isCapturedFrame(frame)) return
      fresh.push(frame)
      queueMicrotask(() => bus.resolve(frame.requestId, {ok: true, result: {}}))
    })

    await bus.ask('s1', {name: 'page.text', input: {}})

    expect(fresh).toHaveLength(1)
    expect(stale).toHaveLength(0)
  })

  it('an unsubscribe from a replaced subscription does not evict the newer one', async () => {
    const bus = makePageBus(1_000)
    const fresh: CapturedFrame[] = []
    const unsubscribeStale = bus.subscribe('s1', () => {})
    bus.subscribe('s1', (frame) => {
      if (!isCapturedFrame(frame)) return
      fresh.push(frame)
      queueMicrotask(() => bus.resolve(frame.requestId, {ok: true, result: {}}))
    })

    unsubscribeStale()
    await bus.ask('s1', {name: 'page.text', input: {}})

    expect(fresh).toHaveLength(1)
  })
})
