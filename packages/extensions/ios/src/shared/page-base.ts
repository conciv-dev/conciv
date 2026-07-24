const NATIVE_ROUTE = '/native'

export function nativePageBase(location: {origin: string; pathname: string}): string {
  const index = location.pathname.lastIndexOf(NATIVE_ROUTE)
  const prefix = index >= 0 ? location.pathname.slice(0, index) : ''
  return `${location.origin}${prefix}`
}
