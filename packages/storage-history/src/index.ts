import {
  createHistory,
  parseHref,
  type NavigationBlocker,
  type ParsedHistoryState,
  type RouterHistory,
} from '@tanstack/history'

export type WebStorage = Pick<Storage, 'getItem' | 'setItem'>

const DEFAULT_KEY = 'conciv-history'
const MAX_ENTRIES = 100

type Persisted = {entries: string[]; index: number}

function isPersisted(value: unknown): value is Persisted {
  return (
    typeof value === 'object' &&
    value !== null &&
    'entries' in value &&
    Array.isArray(value.entries) &&
    value.entries.length > 0 &&
    value.entries.every((entry) => typeof entry === 'string') &&
    'index' in value &&
    typeof value.index === 'number' &&
    Number.isInteger(value.index)
  )
}

function readPersisted(storage: WebStorage, key: string): Persisted {
  try {
    const raw = storage.getItem(key)
    if (!raw) return {entries: ['/'], index: 0}
    const parsed: unknown = JSON.parse(raw)
    if (!isPersisted(parsed)) return {entries: ['/'], index: 0}
    return {entries: parsed.entries, index: Math.min(Math.max(parsed.index, 0), parsed.entries.length - 1)}
  } catch {
    return {entries: ['/'], index: 0}
  }
}

function freshState(position: number): ParsedHistoryState {
  return {key: crypto.randomUUID().slice(0, 8), __TSR_index: position}
}

export function createWebStorageHistory(opts: {storage: WebStorage; key?: string}): RouterHistory {
  const key = opts.key ?? DEFAULT_KEY
  const persisted = readPersisted(opts.storage, key)
  const entries = persisted.entries
  const states = entries.map((_entry, position) => freshState(position))
  let index = persisted.index

  const persist = (): void => {
    try {
      opts.storage.setItem(key, JSON.stringify({entries, index}))
    } catch {
      return
    }
  }

  const trim = (): void => {
    if (entries.length <= MAX_ENTRIES) return
    const excess = entries.length - MAX_ENTRIES
    entries.splice(0, excess)
    states.splice(0, excess)
    index = Math.max(index - excess, 0)
  }

  let blockers: Array<NavigationBlocker> = []

  return createHistory({
    getLocation: () => parseHref(entries[index] ?? '/', states[index]),
    getLength: () => entries.length,
    pushState: (path, state) => {
      if (index < entries.length - 1) {
        entries.splice(index + 1)
        states.splice(index + 1)
      }
      entries.push(path)
      states.push(state)
      index = entries.length - 1
      trim()
      persist()
    },
    replaceState: (path, state) => {
      entries[index] = path
      states[index] = state
      persist()
    },
    back: () => {
      index = Math.max(index - 1, 0)
      persist()
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1)
      persist()
    },
    go: (n) => {
      index = Math.min(Math.max(index + n, 0), entries.length - 1)
      persist()
    },
    createHref: (path) => path,
    getBlockers: () => blockers,
    setBlockers: (next) => {
      blockers = next
    },
  })
}
