import {checkEngines, type EngineRow} from '@conciv/db'
import {ORPCError} from '@orpc/client'
import {partition} from 'es-toolkit'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import {engineOutdated, pageCall, type PageState, type TabsListing} from './hub/page.js'
import {currentBranch, projectName} from './hub/project.js'

export const ENGINE_READ_MS = 2_000

export const PROBE_MS = 300

export const TOO_OLD = 'engine too old; upgrade its @conciv packages'

export type Checked = Awaited<ReturnType<typeof checkEngines>>

export type Silent = Checked['unreachable']

type TabOpen = {open: boolean}

export type TabAsk<Row = EngineRow> = {row: Row; answer: TabOpen | null; failure: unknown}

type TabRow = TabsListing['tabs'][number]

type Place = Pick<TabRow, 'project' | 'branch' | 'root'>

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
  return pageCall(
    makeRpcClient(row.apiBase, {token: row.token}),
    'tabs.list',
    {sessionId: tab},
    AbortSignal.timeout(timeoutMs),
  ).then(
    (state): TabAsk<Row> => ({row, answer: {open: state !== null && state.tabs.length > 0}, failure: null}),
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
    const rpc = makeRpcClient(row.apiBase, {token: row.token})
    const signal = AbortSignal.timeout(ENGINE_READ_MS)
    const [location, attached] = await Promise.all([
      rpc.location.get(undefined, {signal}),
      pageCall(rpc, 'sessions.attached', {}, signal),
    ])
    const place = await placeAt(location.directory)
    const rows = await Promise.all((attached ?? []).map((sessionId) => tabRow(rpc, sessionId, place, signal)))
    return {tabs: rows.filter((listed) => listed !== null), unreachable: []}
  } catch (error) {
    return {tabs: [], unreachable: [{root: row.root, error: engineOutdated(error) ? TOO_OLD : errorText(error)}]}
  }
}

async function placeAt(root: string): Promise<Place> {
  const [project, branch] = await Promise.all([projectName(root), currentBranch(root)])
  return {...(project === null ? {} : {project}), ...(branch === null ? {} : {branch}), root}
}

async function tabRow(rpc: RpcClient, sessionId: SessionId, place: Place, signal: AbortSignal): Promise<TabRow | null> {
  const [meta, state] = await Promise.all([
    rpc.sessions.get({sessionId}, {signal}).catch((error: unknown) => {
      if (error instanceof ORPCError && error.code === 'NOT_FOUND') return null
      throw error
    }),
    pageCall(rpc, 'tabs.list', {sessionId}, signal).catch((error: unknown) => {
      if (engineOutdated(error)) throw error
      process.stderr.write(
        `conciv: reading the browser tabs of session ${sessionId} on ${place.root} failed; it is listed with none: ${errorText(error)}\n`,
      )
      return null
    }),
  ])
  if (meta === null || meta.hidden) return null
  const browserTabs = focusedFirst(state)
  const [page] = browserTabs
  return {
    tab: sessionId,
    ...place,
    ...(page === undefined ? {} : {href: page.href, pageTitle: page.pageTitle, state: page.state}),
    sessionTitle: meta.title,
    lastActive: new Date(meta.updatedAt).toISOString(),
    running: meta.running,
    harness: meta.harnessKind,
    browserTabs,
  }
}

function focusedFirst(state: PageState | null): TabRow['browserTabs'] {
  if (state === null) return []
  const [focused, others] = partition(state.tabs, (tab) => tab.id === state.focusedTabId)
  return [...focused, ...others].map((tab) => ({
    id: tab.id,
    href: tab.url,
    pageTitle: tab.title,
    state: tab.visible ? 'visible' : 'hidden',
  }))
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
