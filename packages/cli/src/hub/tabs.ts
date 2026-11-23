import {differenceBy, partition} from 'es-toolkit'
import {Cache, Duration, Effect, Exit, Ref} from 'effect'
import type {EngineRow} from '@conciv/db'
import {makeRpcClient, type CodeReply, type RpcClient} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import {
  askAgain,
  askTab,
  askTabs,
  ENGINE_READ_MS,
  errorText,
  homeRead,
  liveEngines,
  logHub,
  PROBE_MS,
  silence,
  TOO_OLD,
  type Checked,
  type Silent,
  type TabAsk,
} from '../engine-read.js'
import {engineOutdated} from './page.js'

export type TabOwner = {root: string; apiBase: string; token: string; rpc: RpcClient; lookup: RpcClient}

export type TabState =
  | {status: 'unknown'}
  | {status: 'finding'; first: Checked; settled: TabAsk[]; unsettled: EngineRow[]}
  | {status: 'owned'; row: EngineRow}
  | {status: 'failed'; error: Error}

export type TabEvent =
  | {type: 'probed'; tab: SessionId; checked: Checked; probes: TabAsk[]}
  | {type: 'probed-again'; tab: SessionId; checked: Checked; probes: TabAsk[]}

const KEPT_TABS = 1024

export function transitionTab(state: TabState, event: TabEvent): TabState {
  if (state.status === 'unknown' && event.type === 'probed') {
    const [settled, unsettled] = partition(event.probes, (probe) => probe.answer !== null)
    if (openRows(event.probes).length > 0 || (event.checked.unreachable.length === 0 && unsettled.length === 0)) {
      return ownerAmong(event.tab, event.probes, event.checked.unreachable)
    }
    return {status: 'finding', first: event.checked, settled, unsettled: unsettled.map((probe) => probe.row)}
  }
  if (state.status === 'finding' && event.type === 'probed-again') {
    return ownerAmong(event.tab, [...state.settled, ...event.probes], event.checked.unreachable)
  }
  return state
}

function openRows(probes: TabAsk[]): EngineRow[] {
  return probes.flatMap((probe) => (probe.answer?.open === true ? [probe.row] : []))
}

function ownerAmong(tab: SessionId, probes: TabAsk[], silent: Silent): TabState {
  const [only, second] = openRows(probes)
  const failures = [
    ...probes.flatMap((probe) => (probe.answer === null ? [failedProbe(probe.row.root, probe.failure)] : [])),
    ...silent.map((entry) => new Error(silence([entry]))),
  ]
  if (only === undefined) return {status: 'failed', error: notOpen(tab, failures)}
  if (second !== undefined) {
    return {
      status: 'failed',
      error: new Error(
        `tab ${tab} is open on two conciv engines (${only.root} and ${second.root}); ask the user to close one of the browser tabs`,
      ),
    }
  }
  return {status: 'owned', row: only}
}

function notOpen(tab: SessionId, failures: unknown[]): Error {
  if (failures.length === 0) return new Error(`TAB_NOT_OPEN: tab ${tab} is not open; call list_tabs`)
  return new Error(
    `cannot tell whether tab ${tab} is open: no engine that answered has it, and ${failures.map(errorText).join('; ')}; nothing ran`,
    {cause: new AggregateError(failures, 'the tab probes failed')},
  )
}

function failedProbe(root: string, failure: unknown): Error {
  if (engineOutdated(failure)) return new Error(`${root} (${TOO_OLD})`, {cause: failure})
  return new Error(silence([{root, error: errorText(failure)}]), {cause: failure})
}

export const makeTabs = Effect.fn('Tabs.make')(function* (home: string, headers: Record<string, string>) {
  const owners = yield* Cache.makeWith((tab: SessionId) => findOwner(home, tab, headers), {
    capacity: KEPT_TABS,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
  })
  const greeted = yield* Ref.make<ReadonlySet<SessionId>>(new Set())
  const greet = (tab: SessionId, owner: TabOwner, reply: CodeReply) =>
    Ref.modify(greeted, (held): [boolean, ReadonlySet<SessionId>] => [held.has(tab), new Set([...held, tab])]).pipe(
      Effect.flatMap((already) => (already ? Effect.succeed(reply) : withInstructions(owner, tab, reply))),
    )
  return {
    owner: (tab: SessionId) => Cache.get(owners, tab),
    forget: (tab: SessionId, owner: TabOwner) =>
      Cache.invalidateWhen(owners, tab, (held) => held === owner).pipe(Effect.asVoid),
    holds: (tab: SessionId, owner: TabOwner) => Effect.promise(() => holdsTab(owner, tab)),
    greet,
  }
})

export type Tabs = Effect.Success<ReturnType<typeof makeTabs>>

function findOwner(home: string, tab: SessionId, headers: Record<string, string>): Effect.Effect<TabOwner, unknown> {
  return Effect.tryPromise({
    try: async () => {
      const checked = await liveEngines(home)
      const probes = await askTabs(checked.live, tab, PROBE_MS)
      return transitionTab({status: 'unknown'}, {type: 'probed', tab, checked, probes})
    },
    catch: (error) => error,
  }).pipe(Effect.flatMap((state) => ownerStep(home, tab, headers, state)))
}

function ownerStep(
  home: string,
  tab: SessionId,
  headers: Record<string, string>,
  state: TabState,
): Effect.Effect<TabOwner, unknown> {
  if (state.status === 'owned') return Effect.succeed(tabOwner(state.row, headers))
  if (state.status === 'failed') return Effect.fail(state.error)
  if (state.status === 'unknown') return findOwner(home, tab, headers)
  return Effect.tryPromise({
    try: async () => {
      const [second, retried] = await Promise.all([
        homeRead(home, askAgain(home, state.first.unreachable)),
        askTabs(state.unsettled, tab, ENGINE_READ_MS),
      ])
      const later = await askTabs(
        differenceBy(second.live, state.first.live, (row) => row.id),
        tab,
        ENGINE_READ_MS,
      )
      return transitionTab(state, {type: 'probed-again', tab, checked: second, probes: [...retried, ...later]})
    },
    catch: (error) => error,
  }).pipe(Effect.flatMap((next) => ownerStep(home, tab, headers, next)))
}

function tabOwner(row: EngineRow, headers: Record<string, string>): TabOwner {
  return {
    root: row.root,
    apiBase: row.apiBase,
    token: row.token,
    rpc: makeRpcClient(row.apiBase, {token: row.token, headers}),
    lookup: makeRpcClient(row.apiBase, {token: row.token}),
  }
}

async function holdsTab(owner: TabOwner, tab: SessionId): Promise<boolean> {
  const asked = await askTab(owner, tab, PROBE_MS)
  if (asked.answer !== null) return asked.answer.open
  logHub(
    `checking whether tab ${tab} is still open failed; the next call looks up its engine again`,
    failedProbe(owner.root, asked.failure),
  )
  return false
}

function withInstructions(owner: TabOwner, tab: SessionId, reply: CodeReply): Effect.Effect<CodeReply> {
  return Effect.promise(() =>
    owner.lookup.sessions.instructions({sessionId: tab}, {signal: AbortSignal.timeout(ENGINE_READ_MS)}).then(
      (answer) => answer.text,
      (error: unknown) => {
        logHub(`reading the instructions of tab ${tab} failed; the reply goes without them`, error)
        return ''
      },
    ),
  ).pipe(
    Effect.map((instructions): CodeReply => {
      if (instructions === '') return reply
      return {...reply, content: [{type: 'text', text: instructions}, ...reply.content]}
    }),
  )
}
