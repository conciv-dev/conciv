import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {checkEngines, type EngineRow} from '@conciv/db'
import {engineTooOld, makeRpcClient, type RpcClient} from '@conciv/contract'
import {Definition as PageRpc, type State} from '@conciv/plugin-page/rpc'
import type {SessionId, TabOpen, TabsListing} from '@conciv/protocol/chat-types'

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

const PageUnlistedSchema = z.object({
  code: z.literal('PLUGIN_RPC'),
  data: z.object({type: z.literal('rpc.unavailable')}),
})

const SessionGoneSchema = z.object({code: z.literal('NOT_FOUND')})

const PackageNameSchema = z.object({name: z.string()})

async function engineTabs(row: EngineRow): Promise<TabsListing> {
  const rpc = makeRpcClient(row.apiBase, {token: row.token})
  const signal = AbortSignal.timeout(ENGINE_READ_MS)
  try {
    const [location, vcs, attached] = await Promise.all([
      rpc.location.get(undefined, {signal}),
      rpc.vcs.get(undefined, {signal}),
      attachedSessions(rpc, signal),
    ])
    const project = await projectName(location.directory)
    const branch = vcs.data.branch.current
    const engine = {
      ...(project === null ? {} : {project}),
      ...(branch === undefined ? {} : {branch}),
      root: location.directory,
    }
    const rows = await Promise.all(attached.map((sessionId) => sessionRow(rpc, sessionId, engine, signal)))
    return {tabs: rows.flatMap((tab) => (tab === null ? [] : [tab])), unreachable: []}
  } catch (error) {
    return {tabs: [], unreachable: [{root: row.root, error: engineTooOld(error) ? TOO_OLD : errorText(error)}]}
  }
}

function attachedSessions(rpc: RpcClient, signal: AbortSignal): Promise<SessionId[]> {
  return rpc.plugin.call({rpcId: PageRpc.id, method: 'sessions.attached', input: {}}, {signal}).then(
    (answer) => PageRpc.methods['sessions.attached'].output.parse(answer),
    (error: unknown) => {
      if (PageUnlistedSchema.safeParse(error).success) return []
      throw error
    },
  )
}

async function sessionRow(
  rpc: RpcClient,
  sessionId: SessionId,
  engine: {project?: string; branch?: string; root: string},
  signal: AbortSignal,
): Promise<TabRow | null> {
  const [meta, state] = await Promise.all([
    rpc.sessions.get({sessionId}, {signal}).catch((error: unknown) => {
      if (SessionGoneSchema.safeParse(error).success) return null
      throw error
    }),
    rpc.plugin
      .call({rpcId: PageRpc.id, method: 'tabs.list', input: {sessionId}}, {signal})
      .then((answer) => PageRpc.methods['tabs.list'].output.parse(answer)),
  ])
  if (meta === null || meta.hidden) return null
  const browserTabs = focusedFirst(state).map((tab) => ({
    id: tab.id,
    href: tab.url,
    pageTitle: tab.title,
    state: tab.visible ? ('visible' as const) : ('hidden' as const),
  }))
  const page = browserTabs[0]
  return {
    tab: sessionId,
    ...engine,
    ...(page === undefined ? {} : {href: page.href, pageTitle: page.pageTitle, state: page.state}),
    sessionTitle: meta.title,
    lastActive: new Date(meta.updatedAt).toISOString(),
    running: meta.running,
    harness: meta.harnessKind,
    browserTabs,
  }
}

function focusedFirst({tabs, focusedTabId}: State): State['tabs'] {
  return [...tabs.filter((tab) => tab.id === focusedTabId), ...tabs.filter((tab) => tab.id !== focusedTabId)]
}

async function projectName(root: string): Promise<string | null> {
  try {
    return (
      PackageNameSchema.safeParse(JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))).data?.name ?? null
    )
  } catch {
    return null
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
