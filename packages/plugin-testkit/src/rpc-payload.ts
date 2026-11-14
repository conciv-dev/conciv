export function samePath(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((segment, index) => segment === expected[index])
}

export function matchesPattern(actual: unknown, expected: unknown): boolean {
  if (expected instanceof RegExp) return expected.test(typeof actual === 'string' ? actual : JSON.stringify(actual))
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item, index) => matchesPattern(actual[index], item))
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null) return false
    const carried: Record<string, unknown> = {...actual}
    return Object.entries(expected).every(([key, value]) => matchesPattern(carried[key], value))
  }
  return Object.is(actual, expected)
}
