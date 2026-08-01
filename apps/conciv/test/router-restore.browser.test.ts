import {describe, expect, it} from 'vitest'
import {createWebStorageHistory, type WebStorage} from '@conciv/storage-history'
import {makeRpcClient} from '@conciv/contract'
import {defineExtension} from '@conciv/extension'
import {parseConcivSettings} from '../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../src/router.js'

function makeMemoryStorage(): WebStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

function routerOn(storage: WebStorage) {
  return createConcivRouter({
    rpc: makeRpcClient('http://127.0.0.1:9'),
    history: createWebStorageHistory({storage}),
    environment: {rootNode: document, document},
    settings: parseConcivSettings(''),
  })
}

describe('createConcivRouter with storage-history', () => {
  it('restores the last route after a simulated reload', async () => {
    const storage = makeMemoryStorage()
    const before = createWebStorageHistory({storage})
    before.push('/panel/conciv_abc123')
    const router = routerOn(storage)
    await router.load()
    expect(router.state.location.pathname).toBe('/panel/conciv_abc123')
    expect(router.state.matches.map((match) => match.routeId)).toContain('/panel/$sessionId')
    expect(router.state.matches.at(-1)?.params).toEqual({sessionId: 'conciv_abc123'})
  })

  it('restores quick-layer search params and back-stack through a reload', async () => {
    const storage = makeMemoryStorage()
    const before = createWebStorageHistory({storage})
    before.push('/panel/conciv_abc123')
    before.push('/quick?panes=conciv_abc123&focus=0')
    const router = routerOn(storage)
    await router.load()
    expect(router.state.location.pathname).toBe('/quick')
    expect(router.state.location.search).toEqual({panes: 'conciv_abc123', focus: 0})
    router.history.back()
    expect(router.history.location.pathname).toBe('/panel/conciv_abc123')
  })

  it('invokes every extension instance disposer on teardown, even when one throws', () => {
    const order: string[] = []
    const first = defineExtension({name: 'dispose-a'}).client(() => ({value: {}, dispose: () => order.push('a')}))
    const second = defineExtension({name: 'dispose-b'}).client(() => ({
      value: {},
      dispose: () => {
        order.push('b')
        throw new Error('teardown b blew up')
      },
    }))
    const third = defineExtension({name: 'dispose-c'}).client(() => ({value: {}, dispose: () => order.push('c')}))
    const router = createConcivRouter({
      rpc: makeRpcClient('http://127.0.0.1:9'),
      history: createWebStorageHistory({storage: makeMemoryStorage()}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(''),
      extensions: [first, second, third],
    })
    expect(() => disposeConcivRouter(router)).not.toThrow()
    expect(order).toEqual(['a', 'b', 'c'])
  })
})
