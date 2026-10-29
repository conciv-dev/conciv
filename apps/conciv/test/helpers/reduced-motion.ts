const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function forceReducedMotion(): () => void {
  const original = window.matchMedia
  const reduced = original(REDUCED_MOTION_QUERY)
  Object.defineProperty(reduced, 'matches', {value: true})
  window.matchMedia = (query: string) => (query === REDUCED_MOTION_QUERY ? reduced : original(query))
  return () => {
    window.matchMedia = original
  }
}
