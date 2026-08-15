import type {Page} from '@playwright/test'
import type {NavigationEntry} from '@conciv/protocol/chat-types'
import {until} from '@conciv/harness-testkit/until'
import type {EmbedKit} from '../../helpers/boot.js'

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

export function untilNavigationHref(kit: EmbedKit, matches: (href: string) => boolean): Promise<void> {
  return until(async () => matches(await currentHref(kit)), {hangGuardMs: 30_000, intervalMs: 100})
}

export async function panelSessionId(kit: EmbedKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  const panelEntry = persisted?.entries.find((entry) => entry.href.startsWith('/panel/'))
  return (panelEntry?.href.split('/')[2] ?? '').split('?')[0] ?? ''
}

export async function freezeClock(page: Page, now: number): Promise<void> {
  await page.addInitScript((frozen: number) => {
    Date.now = () => frozen
  }, now)
}
