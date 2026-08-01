import type {Page, Response} from 'playwright'
import type {NavigationEntry} from '@conciv/protocol/chat-types'
import type {EmbedKit} from './boot.js'

let lastStamp = 0

export function navigationStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

export async function setNavigation(kit: EmbedKit, entries: NavigationEntry[], index = 0): Promise<boolean> {
  const stored = await kit.rpc.navigation.get()
  lastStamp = Math.max(lastStamp, stored?.updatedAt ?? 0)
  const result = await kit.rpc.navigation.set({entries, index, updatedAt: navigationStamp()})
  return result.applied
}

export async function currentHref(kit: EmbedKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  return persisted?.entries[persisted.index]?.href ?? ''
}

function isNavigationWrite(url: URL): boolean {
  return url.pathname.endsWith('/rpc/navigation/set')
}

export type HeldNavigationWrite = {arrived: Promise<void>; release: () => void}

export async function holdFirstNavigationWrite(page: Page): Promise<HeldNavigationWrite> {
  let release = (): void => {}
  let markArrived = (): void => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const arrived = new Promise<void>((resolve) => {
    markArrived = resolve
  })
  let seen = 0
  await page.route(isNavigationWrite, async (route) => {
    seen += 1
    if (seen > 1) return route.abort()
    markArrived()
    await gate
    await route.continue()
  })
  return {arrived, release}
}

export function waitForNavigationWrite(page: Page): Promise<Response> {
  return page.waitForResponse((response) => isNavigationWrite(new URL(response.url())))
}

export async function freezeClock(page: Page, now: number): Promise<void> {
  await page.addInitScript((frozen: number) => {
    Date.now = () => frozen
  }, now)
}
