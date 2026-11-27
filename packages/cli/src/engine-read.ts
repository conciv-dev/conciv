import {checkEngines, type EngineRow} from '@conciv/home'
import {z} from 'zod'
import {ORPCError} from '@orpc/client'
import {engineTooOld, makeRpcClient, type EngineClient} from '@conciv/client'
import {contractCode, type Project, type SessionMeta} from '@conciv/protocol'
import type {BrowserTabList} from '@conciv/protocol/schema/browser-tab'
import {SessionId} from '@conciv/types/chat-types'
import {causeFrom, cliErrors, engineErrors} from '@conciv/errors'

export const ENGINE_READ_MS = 2_000

export const PROBE_MS = 300

export const TOO_OLD = 'engine too old; upgrade its @conciv packages'

export type Checked = Awaited<ReturnType<typeof checkEngines>>

export type Silent = Checked['unreachable']

export type TabOpen = {open: boolean; instructions: string | null}

export type TabAsk<Row = EngineRow> = {row: Row; answer: TabOpen | null; failure: unknown}

const TabsListingSchema = z.object({
  tabs: z.array(
    z.object({
      tab: SessionId,
      project: z.string().optional(),
      branch: z.string().optional(),
      root: z.string(),
      href: z.string().optional(),
      pageTitle: z.string().optional(),
      sessionTitle: z.string(),
      lastActive: z.string(),
      running: z.boolean(),
      state: z.enum(['visible', 'hidden']).optional(),
      harness: z.string(),
      browserTabs: z.array(
        z.object({
          id: z.string(),
          href: z.string().optional(),
          pageTitle: z.string().optional(),
          state: z.enum(['visible', 'hidden']).optional(),
        }),
      ),
    }),
  ),
  unreachable: z.array(z.object({root: z.string(), error: z.string()})),
})

export type TabsListing = z.infer<typeof TabsListingSchema>

type TabRow = TabsListing['tabs'][number]

type Signal = {signal: AbortSignal}

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
  throw cliErrors.NO_ENGINE_RUNNING({home})
}

export function homeRead(home: string, reading: Promise<Checked>): Promise<Checked> {
  return reading.catch((error: unknown) => {
    throw cliErrors.HOME_UNREADABLE({home, reason: errorText(error), ...causeFrom(error)})
  })
}

function readState(rpc: EngineClient, sessionId: SessionId, options: Signal): Promise<BrowserTabList> {
  return rpc.tabs.list({sessionId}, options)
}

export function askTab<Row extends {apiBase: string; token: string}>(
  row: Row,
  tab: SessionId,
  timeoutMs: number,
): Promise<TabAsk<Row>> {
  const rpc = makeRpcClient(row.apiBase, {token: row.token})
  const options = {signal: AbortSignal.timeout(timeoutMs)}
  return Promise.all([readState(rpc, tab, options), rpc.meta.project(undefined, options)]).then(
    ([state, project]): TabAsk<Row> => ({
      row,
      answer: {open: state.tabs.length > 0, instructions: project.instructions},
      failure: null,
    }),
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
  const rpc = makeRpcClient(row.apiBase, {token: row.token})
  const options = {signal: AbortSignal.timeout(ENGINE_READ_MS)}
  try {
    const [project, open] = await Promise.all([
      rpc.meta.project(undefined, options),
      rpc.tabs.sessions(undefined, options),
    ])
    const rows = await Promise.all(open.map((sessionId) => sessionTab(rpc, project, sessionId, options)))
    return {tabs: rows.flat(), unreachable: []}
  } catch (error) {
    return {tabs: [], unreachable: [{root: row.root, error: engineTooOld(error) ? TOO_OLD : errorText(error)}]}
  }
}

async function sessionTab(
  rpc: EngineClient,
  project: Project,
  sessionId: SessionId,
  options: Signal,
): Promise<TabRow[]> {
  const [meta, state] = await Promise.all([readMeta(rpc, sessionId, options), readState(rpc, sessionId, options)])
  if (meta === null || meta.hidden) return []
  const browserTabs = state.tabs.map((tab) => ({
    id: tab.id,
    href: tab.url,
    pageTitle: tab.title,
    state: tab.visible ? ('visible' as const) : ('hidden' as const),
  }))
  const [first] = browserTabs
  return [
    {
      tab: sessionId,
      ...(project.name === null ? {} : {project: project.name}),
      ...(project.branch === null ? {} : {branch: project.branch}),
      root: project.root,
      ...(first === undefined ? {} : {href: first.href, pageTitle: first.pageTitle, state: first.state}),
      sessionTitle: meta.title,
      lastActive: new Date(meta.updatedAt).toISOString(),
      running: meta.running,
      harness: meta.harnessKind,
      browserTabs,
    },
  ]
}

function readMeta(rpc: EngineClient, sessionId: SessionId, options: Signal): Promise<SessionMeta | null> {
  return rpc.sessions.get({sessionId}, options).catch((error: unknown) => {
    if (error instanceof ORPCError && error.code === contractCode(engineErrors.NOT_FOUND)) return null
    throw error
  })
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
