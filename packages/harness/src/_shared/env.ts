export function definedEntries(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])))
}
