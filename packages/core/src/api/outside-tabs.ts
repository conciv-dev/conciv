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

const PROBE_MS = 2000

const TOO_OLD = 'engine too old; upgrade its @conciv packages'

type Unreachable = TabsListing['unreachable'][number]

type TabRow = TabsListing['tabs'][number]

type OwnedTab = {apiBase: string; root: string; instructions: string | null; tools: TabOpen['tools']}

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

  async function find(tab: SessionId): Promise<OwnedTab> {
    const checked = await liveEngines()
    const answers = await Promise.all(checked.live.map((row) => openOn(row, tab)))
    const owners = answers.flatMap((answer) => (answer === null ? [] : [answer]))
    const [only, second] = owners
    if (only === undefined) {
      throw toolError('TAB_NOT_OPEN', {message: notOpen({tab, open: (await list()).tabs})})
    }
    if (second !== undefined) {
      const roots = owners.map((owner) => owner.root).join(', ')
      throw toolError('TAB_NOT_OPEN', {
        message: `tab ${tab} is open in ${owners.length} running conciv dev servers: ${roots}.`,
      })
    }
    return only
  }

  return {list, find}
}

async function engineTabs(row: EngineRow): Promise<{tabs: Tabs} | {unreachable: Unreachable}> {
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

async function openOn(row: EngineRow, tab: SessionId): Promise<OwnedTab | null> {
  try {
    const url = `${row.apiBase}/api/tabs?session=${encodeURIComponent(tab)}`
    const response = await fetch(url, {signal: AbortSignal.timeout(PROBE_MS)})
    if (!response.ok) return null
    const answer = TabOpenSchema.safeParse(await response.json())
    if (!answer.success || !answer.data.open) return null
    return {apiBase: row.apiBase, root: row.root, instructions: answer.data.instructions, tools: answer.data.tools}
  } catch {
    return null
  }
}

function notOpen(input: {tab: SessionId; open: TabRow[]}): string {
  const gone = `tab ${input.tab} is not open in any running conciv dev server`
  if (input.open.length === 0) return `${gone}; no conciv tab is open now, ask the user to open the page`
  const named = input.open.map((row) => `${row.tab} in ${row.root}${row.href === undefined ? '' : ` at ${row.href}`}`)
  return `${gone}; open now: ${named.join('; ')}. Take the one for your project.`
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
