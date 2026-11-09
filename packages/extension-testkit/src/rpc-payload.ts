const RPC_HTTP_MARKER = '/rpc/'

export function procedurePathOf(url: string): readonly string[] | null {
  const pathname = new URL(url).pathname
  const marker = pathname.indexOf(RPC_HTTP_MARKER)
  if (marker === -1) return null
  return pathname
    .slice(marker + RPC_HTTP_MARKER.length)
    .split('/')
    .filter((segment) => segment !== '')
    .map(decodeURIComponent)
}

export function samePath(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((segment, index) => segment === expected[index])
}
