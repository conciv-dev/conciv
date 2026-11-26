import '@testing-library/jest-dom/vitest'
import {afterEach, beforeEach, inject} from 'vitest'
import {page, server} from 'vitest/browser'
import {cleanup, configure} from '@solidjs/testing-library'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

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

function removeAddedNodes(parent: Element, kept: ReadonlySet<Element>): void {
  for (const child of Array.from(parent.children)) if (!kept.has(child)) child.remove()
}

beforeEach(({onTestFinished}) => {
  const address = location.href
  const head = new Set(document.head.children)
  const body = new Set(document.body.children)
  onTestFinished(async () => {
    removeAddedNodes(document.head, head)
    removeAddedNodes(document.body, body)
    history.replaceState(null, '', address)
    await clearBrowserProfile()
  })
})

afterEach(cleanup)

const SHOT_NAME_MAX = 200

afterEach(async ({task}) => {
  if (task.result?.state !== 'fail') return
  const name = task.fullTestName.replace(/\W/g, '-')
  const capped = name.length > SHOT_NAME_MAX ? `${name.slice(0, SHOT_NAME_MAX)}-${task.id}` : name
  const file = task.file.filepath.split('/').at(-1) ?? 'test'
  await page.screenshot({path: `${server.config.attachmentsDir}/failure-screenshots/${file}/${capped}.png`})
})

const viewport = inject('concivViewport')
afterEach(() => page.viewport(viewport.width, viewport.height))
