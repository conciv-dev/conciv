import {createSignal, type Signal} from 'solid-js'

// One guarded gateway to localStorage for the widget. Access can throw (private mode, disabled
// storage, sandboxed iframe), so every read/write is wrapped — a failure just means the value
// lives in memory for the session.

// Guarded read + validate. `parse` returns undefined to reject a stored value (missing/corrupt/
// stale), in which case `fallback` is used.
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

// Guarded write. null/undefined removes the key (so an empty value doesn't linger as a stale read).
export function writeStorage<T>(key: string, value: T, serialize: (v: T) => string = String): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, serialize(value))
  } catch {
    // storage unavailable — value still lives in memory
  }
}

// A signal that mirrors to localStorage, writing through on every set (no effect — the write stays
// in the caller's handler path, matching the rest of the widget). Use this when every change should
// persist; for deferred/commit-on-drop persistence (drag, resize) seed a plain signal with
// readStorage() and call writeStorage() at the commit point instead.
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
