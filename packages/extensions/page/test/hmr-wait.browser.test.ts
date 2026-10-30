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

  it('gives up with an explanation when no update ever arrives', async () => {
    const {hot} = fakeHot()
    const result = await watchHotUpdates(hot)(60)
    expect(result).toMatchObject({supported: true, applied: false, error: 'the hot update did not land within 60ms'})
    expect(result.waitedMs).toBeGreaterThanOrEqual(50)
  })

  it('reports applied when the wait is called before the update even starts', async () => {
    const {hot, fire} = fakeHot()
    const waited = watchHotUpdates(hot)(500)
    setTimeout(() => fire('vite:beforeUpdate', {type: 'update', updates: []}), 20)
    setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 40)
    expect(await waited).toMatchObject({supported: true, applied: true, error: null})
  })

  it('reports applied at once when the update landed just before the call', async () => {
    const {hot, fire} = fakeHot()
    const wait = watchHotUpdates(hot)
    fire('vite:beforeUpdate', {type: 'update', updates: []})
    fire('vite:afterUpdate', {type: 'update', updates: []})
    expect(await wait(500)).toEqual({supported: true, applied: true, waitedMs: 0, error: null})
  })

  it('resolves once a pending update is applied', async () => {
    const {hot, fire} = fakeHot()
    const wait = watchHotUpdates(hot)
    fire('vite:beforeUpdate', {type: 'update', updates: []})
    const waited = wait(500)
    setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 50)
    const result = await waited
    expect(result).toMatchObject({supported: true, applied: true, error: null})
    expect(result.waitedMs).toBeGreaterThanOrEqual(40)
    expect(result.waitedMs).toBeLessThan(400)
  })

  it('reports the error when the pending update fails to build', async () => {
    const {hot, fire} = fakeHot()
    const wait = watchHotUpdates(hot)
    fire('vite:beforeUpdate', {type: 'update', updates: []})
    const waited = wait(500)
    fire('vite:error', {type: 'error', err: {message: 'Unexpected token', stack: ''}})
    expect(await waited).toMatchObject({supported: true, applied: false, error: 'Unexpected token'})
  })

  it('gives up with an explanation when the pending update never lands', async () => {
    const {hot, fire} = fakeHot()
    const wait = watchHotUpdates(hot)
    fire('vite:beforeUpdate', {type: 'update', updates: []})
    const result = await wait(60)
    expect(result).toMatchObject({
      supported: true,
      applied: false,
      error: 'the hot update did not land within 60ms',
    })
    expect(result.waitedMs).toBeGreaterThanOrEqual(50)
  })
})
