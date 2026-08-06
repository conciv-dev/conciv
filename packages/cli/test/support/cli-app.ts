import type {PageOutcome} from '@conciv/protocol/page-types'
import {approvalIds, createFakeHarness, createTestkit, type BootApp, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import type {ResolvedConcivConfig} from '@conciv/core/config'

export type BootExtras = {
  bridge?: Parameters<typeof makeApp>[0]['bridge']
  openInEditor?: (file: string, line?: number) => void
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

export async function approvedSession(kit: Kit, cleanups: (() => Promise<void>)[]): Promise<string> {
  const sessionId = await kit.session()
  process.env.CONCIV_SESSION_ID = sessionId
  const abort = new AbortController()
  const stream = await kit.rpc.chat.subscribe({sessionId}, {signal: abort.signal})
  const decided = new Set<string>()
  const pump = (async () => {
    for await (const chunk of stream) {
      for (const approvalId of approvalIds(chunk)) {
        if (decided.has(approvalId)) continue
        decided.add(approvalId)
        await kit.rpc.chat.permissionDecision({approvalId, approved: true})
      }
    }
  })()
  cleanups.push(async () => {
    delete process.env.CONCIV_SESSION_ID
    abort.abort()
    await pump.catch(() => {})
  })
  return sessionId
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
  const queries = await kit.rpc.page.queries(undefined, {signal: abort.signal})
  const state: QueryState = {seen: null}
  void answerFirst(kit, queries, state, outcome, abort).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 50))
  return {seen: () => state.seen}
}
