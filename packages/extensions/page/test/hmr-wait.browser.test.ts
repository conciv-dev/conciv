import {describe, expect, it} from 'vitest'
import {watchHotUpdates, type HotSurface} from '../src/client/hmr.js'

type HotListener = (payload: unknown) => void

function fakeHot() {
  const listeners = new Map<string, HotListener[]>()
  const hot: HotSurface = {
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
  }
  const fire = (event: string, payload: unknown = {}): void => {
    for (const listener of listeners.get(event) ?? []) listener(payload)
  }
  return {hot, fire}
}

describe('the hot update wait', () => {
  it('reports no hot surface as unsupported', async () => {
    expect(await watchHotUpdates(undefined)(1000)).toEqual({supported: false, applied: false, waitedMs: 0, error: null})
  })

  it('returns at once when no update is pending', async () => {
    const {hot} = fakeHot()
    expect(await watchHotUpdates(hot)(1000)).toEqual({supported: true, applied: false, waitedMs: 0, error: null})
  })

  it('resolves once a pending update is applied', async () => {
    const {hot, fire} = fakeHot()
    const wait = watchHotUpdates(hot)
    fire('vite:beforeUpdate', {type: 'update', updates: []})
    const waited = wait(2000)
    setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 50)
    const result = await waited
    expect(result).toMatchObject({supported: true, applied: true, error: null})
    expect(result.waitedMs).toBeGreaterThanOrEqual(40)
    expect(result.waitedMs).toBeLessThan(1000)
  })

  it('reports the error when the pending update fails to build', async () => {
    const {hot, fire} = fakeHot()
    const wait = watchHotUpdates(hot)
    fire('vite:beforeUpdate', {type: 'update', updates: []})
    const waited = wait(2000)
    fire('vite:error', {type: 'error', err: {message: 'Unexpected token', stack: ''}})
    expect(await waited).toMatchObject({supported: true, applied: false, error: 'Unexpected token'})
  })

  it('gives up with an explanation when the pending update never lands', async () => {
    const {hot, fire} = fakeHot()
    const wait = watchHotUpdates(hot)
    fire('vite:beforeUpdate', {type: 'update', updates: []})
    const result = await wait(120)
    expect(result).toMatchObject({
      supported: true,
      applied: false,
      error: 'the hot update did not land within 120ms',
    })
    expect(result.waitedMs).toBeGreaterThanOrEqual(100)
  })
})
