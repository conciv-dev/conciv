import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {toolError} from '@conciv/extension'
import {
  TabOpenSchema,
  TabsSchema,
  type SessionId,
  type TabOpen,
  type Tabs,
  type TabsListing,
} from '@conciv/protocol/chat-types'

const PROBE_MS = 300

const TOO_OLD = 'engine too old; upgrade its @conciv packages'

type Unreachable = TabsListing['unreachable'][number]

type TabRow = TabsListing['tabs'][number]

type EngineListing = {row: EngineRow; tabs: Tabs} | {unreachable: Unreachable}

type OwnedTab = {engine: string; apiBase: string; root: string; instructions: string | null; tools: TabOpen['tools']}

export function createOutsideTabs(given: string | undefined) {
  const home = given ?? concivHome({env: process.env})
  async function liveEngines(): Promise<{live: EngineRow[]; unreachable: Unreachable[]}> {
    try {
      return await checkEngines(home, {timeoutMs: PROBE_MS})
    } catch (error) {
      throw new Error(`cannot read the conciv home folder ${home}: ${errorText(error)}`, {cause: error})
    }
  }

  const last: {listings: EngineListing[]} = {listings: []}

  async function list(): Promise<TabsListing> {
    const checked = await liveEngines()
    const listings = await Promise.all(checked.live.map(engineTabs))
    last.listings = listings
    return {
      tabs: listings.flatMap((listing) => ('tabs' in listing ? listing.tabs.tabs.map(tabRow(listing.tabs)) : [])),
      unreachable: [
        ...checked.unreachable,
        ...listings.flatMap((listing) => ('unreachable' in listing ? [listing.unreachable] : [])),
      ],
    }
  }

  async function find(tab: SessionId): Promise<OwnedTab> {
    const [lister] = last.listings.flatMap((listing) =>
      'tabs' in listing && listing.tabs.tabs.some((entry) => entry.sessionId === tab) ? [listing.row] : [],
    )
    const listed = lister === undefined ? null : await openOn(lister, tab)
    if (listed !== null) return listed
    const checked = await liveEngines()
    const answers = await Promise.all(checked.live.map((row) => openOn(row, tab)))
    const [only, second] = answers.flatMap((answer) => (answer === null ? [] : [answer]))
    if (only === undefined) {
      throw toolError('TAB_NOT_OPEN', {message: `tab ${tab} is not open; call external_tabs({})`})
    }
    if (second !== undefined) {
      throw toolError('TAB_NOT_OPEN', {
        message: `tab ${tab} is open on two engines (${only.root} and ${second.root}); ask the user to close one of the browser tabs`,
      })
    }
    return only
  }

  return {list, find}
}

async function engineTabs(row: EngineRow): Promise<EngineListing> {
  try {
    const response = await fetch(`${row.apiBase}/api/tabs`, {signal: AbortSignal.timeout(PROBE_MS)})
    if (response.status === 404) return {unreachable: {root: row.root, error: TOO_OLD}}
    if (!response.ok) return {unreachable: {root: row.root, error: `/api/tabs answered HTTP ${response.status}`}}
    const tabs = TabsSchema.safeParse(await response.json())
    if (!tabs.success) return {unreachable: {root: row.root, error: TOO_OLD}}
    return {row, tabs: tabs.data}
  } catch (error) {
    return {unreachable: {root: row.root, error: errorText(error)}}
  }
}

async function openOn(row: EngineRow, tab: SessionId): Promise<OwnedTab | null> {
  try {
    const url = `${row.apiBase}/api/tabs?session=${encodeURIComponent(tab)}`
    const response = await fetch(url, {signal: AbortSignal.timeout(PROBE_MS)})
    if (!response.ok) return null
    const answer = TabOpenSchema.safeParse(await response.json())
    if (!answer.success || !answer.data.open) return null
    return {
      engine: row.id,
      apiBase: row.apiBase,
      root: row.root,
      instructions: answer.data.instructions,
      tools: answer.data.tools,
    }
  } catch {
    return null
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
    browserTabs: tab.browserTabs,
  })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
