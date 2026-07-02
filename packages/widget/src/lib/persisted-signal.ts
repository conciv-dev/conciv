import {createSignal, type Signal} from 'solid-js'

export function readStorage<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = parse(raw)
    return parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

export function writeStorage<T>(key: string, value: T, serialize: (v: T) => string = String): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, serialize(value))
  } catch {}
}

export function createPersistedSignal<T>(opts: {
  key: string
  initial: T
  parse: (raw: string) => T | undefined
  serialize?: (v: T) => string
}): Signal<T> {
  const [value, setValue] = createSignal<T>(readStorage(opts.key, opts.parse, opts.initial))
  const set = ((next) => {
    const resolved = setValue(next as Parameters<typeof setValue>[0])
    writeStorage(opts.key, resolved as T, opts.serialize)
    return resolved
  }) as typeof setValue
  return [value, set]
}
