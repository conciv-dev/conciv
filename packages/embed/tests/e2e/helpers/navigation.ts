import type {Page} from '@playwright/test'
import type {NavigationEntry} from '@conciv/protocol/chat-types'
import {defaultStringifySearch, interpolatePath} from '@tanstack/router-core'
import type {linkOptions} from '@tanstack/solid-router'
import {until} from '@conciv/harness-testkit/until'
import {currentHref, navigationStamp, seedNavigationStamp} from '@conciv/extension-testkit/navigation-state'
import type {EmbedKit} from '../../helpers/boot.js'

type RouteAddress = {to: string; params?: Record<string, string>; search?: Record<string, unknown>}

function hrefOf(address: RouteAddress): string {
  const {interpolatedPath} = interpolatePath({path: address.to, params: address.params ?? {}})
  if (!address.search) return interpolatedPath
  return interpolatedPath + defaultStringifySearch(address.search)
}

export function routeHref<const TOptions>(options: Parameters<typeof linkOptions<TOptions>>[0]): string
export function routeHref(address: RouteAddress): string {
  return hrefOf(address)
}

async function writeNavigation(kit: EmbedKit, entries: NavigationEntry[]): Promise<boolean> {
  const stored = await kit.rpc.navigation.get()
  seedNavigationStamp(stored?.updatedAt ?? 0)
  const result = await kit.rpc.navigation.set({entries, index: 0, updatedAt: navigationStamp()})
  return result.applied
}

export function seedRoute<const TOptions>(
  kit: EmbedKit,
  options: Parameters<typeof linkOptions<TOptions>>[0],
): Promise<boolean>
export function seedRoute(kit: EmbedKit, address: RouteAddress): Promise<boolean> {
  return writeNavigation(kit, [{href: hrefOf(address)}])
}

export function seedRawHref(kit: EmbedKit, href: string): Promise<boolean> {
  return writeNavigation(kit, [{href}])
}

export function untilNavigationHref(kit: EmbedKit, matches: (href: string) => boolean): Promise<void> {
  return until(async () => matches(await currentHref(kit)), {hangGuardMs: 30_000, intervalMs: 100})
}

const RELATIVE_HREF_BASE = 'http://widget.invalid'
const SESSION_PROBE = 'conciv-session-probe'

function panelHref(sessionId: string): string {
  return routeHref({to: '/panel/$sessionId', params: {sessionId}})
}

function panelSessionIdOf(href: string): string {
  const [panelPrefix] = panelHref(SESSION_PROBE).split(SESSION_PROBE)
  const {pathname} = new URL(href, RELATIVE_HREF_BASE)
  if (panelPrefix === undefined || !pathname.startsWith(panelPrefix)) return ''
  const [sessionId] = pathname.slice(panelPrefix.length).split('/')
  if (!sessionId) return ''
  return panelHref(sessionId) === panelPrefix + sessionId ? sessionId : ''
}

export async function panelSessionId(kit: EmbedKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  const entries = persisted?.entries ?? []
  return entries.map((entry) => panelSessionIdOf(entry.href)).find((sessionId) => sessionId !== '') ?? ''
}

export async function freezeClock(page: Page, now: number): Promise<void> {
  await page.addInitScript((frozen: number) => {
    Date.now = () => frozen
  }, now)
}
