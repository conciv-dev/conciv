import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {TabsSchema, type Tabs, type TabsListing} from '@conciv/protocol/chat-types'

const PROBE_MS = 300

const TOO_OLD = 'engine too old; upgrade its @conciv packages'

type Unreachable = TabsListing['unreachable'][number]

type TabRow = TabsListing['tabs'][number]

type EngineListing = {tabs: Tabs} | {unreachable: Unreachable}

export function createOutsideTabs(given: string | undefined) {
  const home = given ?? concivHome({env: process.env})
  async function liveEngines(): Promise<{live: EngineRow[]; unreachable: Unreachable[]}> {
    try {
      return await checkEngines(home, {timeoutMs: PROBE_MS})
    } catch (error) {
      throw new Error(`cannot read the conciv home folder ${home}: ${errorText(error)}`, {cause: error})
    }
  }

  async function list(): Promise<TabsListing> {
    const checked = await liveEngines()
    const listings = await Promise.all(checked.live.map(engineTabs))
    return {
      tabs: listings.flatMap((listing) => ('tabs' in listing ? listing.tabs.tabs.map(tabRow(listing.tabs)) : [])),
      unreachable: [
        ...checked.unreachable,
        ...listings.flatMap((listing) => ('unreachable' in listing ? [listing.unreachable] : [])),
      ],
    }
  }

  return {list}
}

async function engineTabs(row: EngineRow): Promise<EngineListing> {
  try {
    const response = await fetch(`${row.apiBase}/api/tabs`, {signal: AbortSignal.timeout(PROBE_MS)})
    if (response.status === 404) return {unreachable: {root: row.root, error: TOO_OLD}}
    if (!response.ok) return {unreachable: {root: row.root, error: `/api/tabs answered HTTP ${response.status}`}}
    const tabs = TabsSchema.safeParse(await response.json())
    if (!tabs.success) return {unreachable: {root: row.root, error: TOO_OLD}}
    return {tabs: tabs.data}
  } catch (error) {
    return {unreachable: {root: row.root, error: errorText(error)}}
  }
}

function tabRow(listing: Tabs) {
  return (tab: Tabs['tabs'][number]): TabRow => ({
    tab: tab.sessionId,
    ...(listing.project.name === null ? {} : {project: listing.project.name}),
    ...(listing.project.branch === null ? {} : {branch: listing.project.branch}),
    root: listing.project.root,
    ...(tab.page === null ? {} : {href: tab.page.href, pageTitle: tab.page.title, state: tab.page.state}),
    sessionTitle: tab.session.title,
    lastActive: new Date(tab.session.updatedAt).toISOString(),
    running: tab.session.running,
    harness: tab.harness,
    browserTabs: tab.browserTabs.map((browserTab) => ({
      id: browserTab.id,
      ...(browserTab.page === null
        ? {}
        : {href: browserTab.page.href, pageTitle: browserTab.page.title, state: browserTab.page.state}),
    })),
  })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
