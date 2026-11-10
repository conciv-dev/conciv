export function whenMissing<T>(fallback: T): (error: unknown) => T {
  return (error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return fallback
    throw error
  }
}
