import {checkEngines, type EngineRow} from '@conciv/db'
import {engineTooOld, makeRpcClient} from '@conciv/contract'
import type {SessionId, TabOpen, Tabs, TabsListing} from '@conciv/protocol/chat-types'

export const ENGINE_READ_MS = 2_000

export const PROBE_MS = 300

export const TOO_OLD = 'engine too old; upgrade its @conciv packages'

export type Checked = Awaited<ReturnType<typeof checkEngines>>

export type Silent = Checked['unreachable']

export type TabAsk<Row = EngineRow> = {row: Row; answer: TabOpen | null; failure: unknown}

type TabRow = TabsListing['tabs'][number]

export function askAgain(home: string, silent: Silent): Promise<Checked> {
  return checkEngines(home, {timeoutMs: ENGINE_READ_MS, roots: silent.map((entry) => entry.root)})
}

export function silence(silent: Silent): string {
  return silent.map((entry) => `${entry.root} did not answer (${entry.error})`).join('; ')
}

export function liveEngines(home: string): Promise<Checked> {
  return homeRead(home, checkEngines(home, {timeoutMs: PROBE_MS}))
}

export async function runningEngines(home: string): Promise<Checked> {
  const checked = await liveEngines(home)
  if (checked.live.length > 0 || checked.unreachable.length > 0) return checked
  throw new Error(`no conciv dev server is running; start one and open its page (conciv home folder read: ${home})`)
}

export function homeRead(home: string, reading: Promise<Checked>): Promise<Checked> {
  return reading.catch((error: unknown) => {
    throw new Error(`cannot read the conciv home folder ${home}: ${errorText(error)}`, {cause: error})
  })
}

export function askTab<Row extends {apiBase: string; token: string}>(
  row: Row,
  tab: SessionId,
  timeoutMs: number,
): Promise<TabAsk<Row>> {
  return makeRpcClient(row.apiBase, {token: row.token})
    .tabs.get({sessionId: tab}, {signal: AbortSignal.timeout(timeoutMs)})
    .then(
      (answer): TabAsk<Row> => ({row, answer, failure: null}),
      (failure: unknown): TabAsk<Row> => ({row, answer: null, failure}),
    )
}

export function askTabs(rows: EngineRow[], tab: SessionId, timeoutMs: number): Promise<TabAsk[]> {
  return Promise.all(rows.map((row) => askTab(row, tab, timeoutMs)))
}

export async function listTabs(home: string): Promise<TabsListing> {
  const checked = await runningEngines(home)
  const listings = await Promise.all(checked.live.map(engineTabs))
  return {
    tabs: listings.flatMap((listing) => listing.tabs),
    unreachable: [...checked.unreachable, ...listings.flatMap((listing) => listing.unreachable)],
  }
}

async function engineTabs(row: EngineRow): Promise<TabsListing> {
  try {
    const listed = await makeRpcClient(row.apiBase, {token: row.token}).tabs.list(undefined, {
      signal: AbortSignal.timeout(ENGINE_READ_MS),
    })
    return {tabs: listed.tabs.map(tabRow(listed)), unreachable: []}
  } catch (error) {
    return {tabs: [], unreachable: [{root: row.root, error: engineTooOld(error) ? TOO_OLD : errorText(error)}]}
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

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
