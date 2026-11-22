function deleted(name: string): Promise<void> {
  const request = indexedDB.deleteDatabase(name)
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve())
    request.addEventListener('error', () => reject(request.error ?? new Error(`could not delete the database ${name}`)))
  })
}

function expireCookies(): void {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

async function clearBrowserProfile(): Promise<void> {
  sessionStorage.clear()
  localStorage.clear()
  expireCookies()
  const databases = await indexedDB.databases()
  await Promise.all(databases.flatMap(({name}) => (name === undefined ? [] : [deleted(name)])))
  const stores = await caches.keys()
  await Promise.all(stores.map((store) => caches.delete(store)))
}

export function freshProfileAfter(onTestFinished: (cleanup: () => Promise<void>) => void): void {
  const address = location.href
  onTestFinished(async () => {
    history.replaceState(null, '', address)
    await clearBrowserProfile()
  })
}
