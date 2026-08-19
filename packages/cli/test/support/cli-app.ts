import type {PageOutcome} from '@conciv/protocol/page-types'
import {createFakeHarness, createTestkit, withAutoApproval, type BootApp, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import type {ResolvedConcivConfig} from '@conciv/core/config'

export type BootExtras = {
  bridge?: Parameters<typeof makeApp>[0]['bridge']
  openInEditor?: (file: string, line?: number) => void
  extensions?: Parameters<typeof makeApp>[0]['extensions']
}

function bootCliApp(extras: BootExtras): BootApp {
  return async (env) => {
    const cfg: ResolvedConcivConfig = {
      enabled: true,
      widgetUrl: undefined,
      stateRoot: env.stateRoot,
      harness: env.harness.id,
      harnessBin: undefined,
      sessionId: '',
      systemPrompt: '',
      extensions: undefined,
    }
    const {app, dispose} = await makeApp({
      cfg,
      cwd: env.cwd,
      openInEditor: extras.openInEditor ?? (() => {}),
      harness: env.harness,
      bridge: extras.bridge,
      extensions: extras.extensions,
    })
    return {fetch: app.fetch, dispose}
  }
}

export async function bootCli(cleanups: (() => Promise<void>)[], extras: BootExtras = {}): Promise<Kit> {
  const kit = await createTestkit(createFakeHarness(), bootCliApp(extras)).setup()
  cleanups.push(() => kit.cleanup())
  process.env.CONCIV_PORT = new URL(kit.base).port
  return kit
}

export async function approvedSession(
  kit: Kit,
  cleanups: (() => Promise<void>)[],
): Promise<{sessionId: string; approved: () => string[]}> {
  const {sessionId} = await kit.rpc.sessions.create(undefined)
  process.env.CONCIV_SESSION_ID = sessionId
  const approved: string[] = []
  const release = {open: (): void => {}}
  const pump = withAutoApproval(
    kit.rpc,
    sessionId,
    () =>
      new Promise<void>((resolve) => {
        release.open = resolve
      }),
    (approvalId) => approved.push(approvalId),
  )
  cleanups.push(async () => {
    delete process.env.CONCIV_SESSION_ID
    release.open()
    await pump.catch(() => {})
  })
  return {sessionId, approved: () => [...approved]}
}

export type SeenQuery = Record<string, unknown>

type Queries = Awaited<ReturnType<Kit['rpc']['page']['queries']>>

type QueryState = {seen: SeenQuery | null}

async function answerFirst(
  kit: Kit,
  queries: Queries,
  state: QueryState,
  outcome: PageOutcome,
  abort: AbortController,
): Promise<void> {
  const first = await queries.next()
  if (first.done) return
  const query = first.value.query
  state.seen = typeof query === 'object' && query !== null ? {...query} : {}
  await kit.rpc.page.reply({requestId: first.value.requestId, outcome})
  abort.abort()
  await queries.return(undefined)
}

export async function answerNextQuery(kit: Kit, outcome: PageOutcome): Promise<{seen: () => SeenQuery | null}> {
  const abort = new AbortController()
  const queries = await kit.rpc.page.queries({sessionId: ''}, {signal: abort.signal})
  const state: QueryState = {seen: null}
  void answerFirst(kit, queries, state, outcome, abort).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 50))
  return {seen: () => state.seen}
}
