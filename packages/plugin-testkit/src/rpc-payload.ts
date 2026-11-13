export function samePath(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((segment, index) => segment === expected[index])
}
