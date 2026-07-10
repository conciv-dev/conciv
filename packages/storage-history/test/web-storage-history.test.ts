import {describe, expect, it} from 'vitest'
import {createWebStorageHistory, type WebStorage} from '../src/index.js'

function makeMemoryStorage(): WebStorage & {map: Map<string, string>} {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

describe('createWebStorageHistory', () => {
  it('starts at / on empty storage', () => {
    const history = createWebStorageHistory({storage: makeMemoryStorage()})
    expect(history.location.pathname).toBe('/')
    expect(history.canGoBack()).toBe(false)
  })

  it('push navigates and a new instance on the same storage restores location and stack', () => {
    const storage = makeMemoryStorage()
    const first = createWebStorageHistory({storage})
    first.push('/panel')
    first.push('/panel/conciv_1')
    const reloaded = createWebStorageHistory({storage})
    expect(reloaded.location.pathname).toBe('/panel/conciv_1')
    reloaded.back()
    expect(reloaded.location.pathname).toBe('/panel')
    reloaded.back()
    expect(reloaded.location.pathname).toBe('/')
  })

  it('back, forward, and go clamp at the stack edges', () => {
    const history = createWebStorageHistory({storage: makeMemoryStorage()})
    history.push('/a')
    history.back()
    history.back()
    expect(history.location.pathname).toBe('/')
    history.forward()
    history.forward()
    expect(history.location.pathname).toBe('/a')
    history.go(-99)
    expect(history.location.pathname).toBe('/')
    history.go(99)
    expect(history.location.pathname).toBe('/a')
  })

  it('push after back truncates the forward stack', () => {
    const storage = makeMemoryStorage()
    const history = createWebStorageHistory({storage})
    history.push('/a')
    history.push('/b')
    history.back()
    history.push('/c')
    history.forward()
    expect(history.location.pathname).toBe('/c')
    const reloaded = createWebStorageHistory({storage})
    reloaded.back()
    expect(reloaded.location.pathname).toBe('/a')
  })

  it('search and hash round-trip through persistence', () => {
    const storage = makeMemoryStorage()
    const history = createWebStorageHistory({storage})
    history.push('/quick?panes=conciv_1,conciv_2&focus=1')
    const reloaded = createWebStorageHistory({storage})
    expect(reloaded.location.pathname).toBe('/quick')
    expect(reloaded.location.search).toBe('?panes=conciv_1,conciv_2&focus=1')
  })

  it('falls back to / on corrupted JSON', () => {
    const storage = makeMemoryStorage()
    storage.map.set('conciv-history', '{nope')
    const history = createWebStorageHistory({storage})
    expect(history.location.pathname).toBe('/')
  })

  it.each([
    ['not an object', '"str"'],
    ['entries not strings', '{"entries":[1,2],"index":0}'],
    ['empty entries', '{"entries":[],"index":0}'],
    ['index out of range', '{"entries":["/a"],"index":9}'],
  ])('falls back safely when persisted shape is invalid: %s', (_name, raw) => {
    const storage = makeMemoryStorage()
    storage.map.set('conciv-history', raw)
    const history = createWebStorageHistory({storage})
    expect(['/', '/a']).toContain(history.location.pathname)
    expect(() => history.push('/next')).not.toThrow()
  })

  it('keeps navigating in memory when setItem throws', () => {
    const storage = makeMemoryStorage()
    const throwing: WebStorage = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const history = createWebStorageHistory({storage: throwing})
    history.push('/panel')
    expect(history.location.pathname).toBe('/panel')
  })

  it('caps the persisted stack at 100 entries, dropping the oldest', () => {
    const storage = makeMemoryStorage()
    const history = createWebStorageHistory({storage})
    for (const n of Array.from({length: 150}, (_value, i) => i)) history.push(`/p${n}`)
    expect(history.location.pathname).toBe('/p149')
    const persisted: unknown = JSON.parse(storage.map.get('conciv-history') ?? '')
    expect(persisted).toMatchObject({index: 99})
    history.go(-99)
    expect(history.location.pathname).toBe('/p50')
  })

  it('honors a custom storage key', () => {
    const storage = makeMemoryStorage()
    createWebStorageHistory({storage, key: 'custom'}).push('/x')
    expect(storage.map.has('custom')).toBe(true)
    expect(storage.map.has('conciv-history')).toBe(false)
  })
})
