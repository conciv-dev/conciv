export function readSessionStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch (error) {
    console.error('[persistence] this page has no sessionStorage', error)
    return undefined
  }
}
