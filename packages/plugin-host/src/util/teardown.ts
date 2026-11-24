export * as Teardown from './teardown.js'

const entries = new Set<{readonly label: string; readonly since: number}>()

export function track(label: string) {
  const entry = {label, since: Date.now()}
  entries.add(entry)
  return () => {
    entries.delete(entry)
  }
}

export function pending(now = Date.now()) {
  return Array.from(entries, (entry) => ({label: entry.label, ms: now - entry.since}))
}
