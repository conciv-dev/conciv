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

export function writeStorage<T>(key: string, value: T, serialize: (value: T) => string = String): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, serialize(value))
  } catch {
    return
  }
}
