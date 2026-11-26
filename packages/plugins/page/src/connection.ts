export * as PageConnection from './connection.js'
import {
  Array as Arr,
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Option,
  Predicate,
  RcMap,
  Request,
  RequestResolver,
  Schedule,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import type {RpcRegistration} from '@conciv/backend-plugin-api/effect/rpc'
import * as Tool from '@conciv/protocol/schema/tool'
import type {SessionId} from '@conciv/types/chat-types'
import {PAGE_QUEUE_REFUSED, PAGE_QUEUE_STOPPED, PageRaisedErrorSchema} from './page-types.js'
import {ACCESS, disconnectedBeforeDispatch, reconcilePagePermissions, selectTarget} from './machine.js'
import {PageQueue} from './queue.js'
import type {GrabStore} from './grabs.js'
import {
  Definition,
  PageChangeEntrySchema,
  type Action,
  type Command,
  type Outcome,
  type PageChangeEntry,
  type Result,
  type Work,
  queueNotice,
} from './rpc.js'
import type {Symbolicator} from './symbolicate.js'
import {PageCaptureBundleSchema, type PageCaptureBundle, type SessionCaptures} from './element-capture-types.js'
import type {StorageEntry} from '@conciv/backend-plugin-api/effect'

const TAB_RETURN_MS = 5000

const TAB_RETURN_POLL = Schedule.max([Schedule.exponential(Duration.millis(50), 1.5), Schedule.recurs(16)])

const Windows = z.object({
  pageReplyTimeoutMs: z.number().int().positive().default(5000),
  queuedActionTimeoutMs: z.number().int().positive().default(7000),
  permissionSyncTimeoutMs: z.number().int().positive().default(10_000),
})

const TRANSPORT_CODES = ['disconnected', 'timeout', 'tab_unavailable']

const PAGE_CODE = /^\[page\.([\w-]+)\]/u

const Coded = z.object({code: z.string()})

const TabGone = Schema.TaggedStruct('PageTabGone', {dispatched: Schema.Boolean})
export type TabGone = typeof TabGone.Type & globalThis.Error

const makeTabGone = (fields: Omit<typeof TabGone.Type, '_tag'>): TabGone =>
  Object.assign(new globalThis.Error('The page tab went away'), TabGone.make(fields), {name: 'PageTabGone'})

type PageError = Tool.Error | TabGone

const PageCall = Request.TaggedClass('PageCall')<
  {
    readonly sessionId: SessionId
    readonly tabId: string
    readonly requestId: string
    readonly command: Command
  },
  Result,
  PageError
>

type PageCall = InstanceType<typeof PageCall>

type Target = {readonly sessionId: SessionId; readonly tabId: string}

export type Call = {
  readonly sessionId: SessionId
  readonly tabId: string | undefined
  readonly action: Work
  readonly reading: boolean
  readonly agentId: string
  readonly timeoutMs?: number
}

export type Connection = Effect.Success<ReturnType<typeof make>>

export function raise(error: Tool.Error): Error {
  return Object.assign(new Error(error.message, {cause: error.error}), error)
}

export function toolFailure(error: PageError): Tool.Error {
  if (Tool.isToolError(error)) return error
  return error.dispatched ? disconnectedAfterDispatch() : disconnectedBeforeDispatch()
}

export function readPageCode(error: Tool.Error): string {
  return PAGE_CODE.exec(error.message)?.[1] ?? Coded.safeParse(error.metadata).data?.code ?? 'failed'
}

function refused(error: Tool.Error): PageQueue.RequestSettlement {
  const message = `the page refused the queue, so this action did not run: ${error.message}`
  return {ok: false, error: Tool.toolError({message, error: {code: PAGE_QUEUE_REFUSED, message}})}
}

function stopped(): PageQueue.RequestSettlement {
  const message = 'the queue stopped before this action ran'
  return {ok: false, error: Tool.toolError({message, error: {code: PAGE_QUEUE_STOPPED, message}})}
}

function settlement(exit: Exit.Exit<Result, PageError>): PageQueue.RequestSettlement {
  if (Exit.isSuccess(exit)) return {ok: true, result: exit.value}
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isNone(failure))
    return {ok: false, error: Tool.toolError({message: `The queued action ended: ${Cause.pretty(exit.cause)}`})}
  const error = failure.value
  if (Tool.isToolError(error)) return {ok: false, error}
  return error.dispatched
    ? {ok: false, error: disconnectedAfterDispatch(), tabClosed: true}
    : {ok: false, error: disconnectedBeforeDispatch()}
}

function callTimeout(action: Work, pageReplyTimeoutMs: number): number {
  if ((action.type === 'wait' || action.type === 'hmr') && action.timeout !== undefined) return action.timeout + 1000
  return pageReplyTimeoutMs
}

function failedOutcome(outcome: Extract<Outcome, {readonly type: 'failure'}>): Tool.Error {
  return Tool.toolError({
    message: `[page.${outcome.code}] ${outcome.message}`,
    metadata: {code: outcome.code, message: outcome.message},
    ...(outcome.raised ? {error: outcome.raised} : {}),
  })
}

function workName(action: Work): string {
  return action.type === 'operation' ? action.name : action.type
}

function disconnectedAfterDispatch() {
  return Tool.toolError({
    message:
      '[page.disconnected] The page connection closed; the action may already have run. Call page.tabs.list({}) once the page is open again and inspect it with page.snapshot({}). Do not repeat clicks, fills or evaluations until their outcome is known.',
  })
}

function dispatchFailed(action: Work, error: unknown) {
  const message = `[page.not_dispatched] Could not dispatch page.${workName(action)}; it did not run. Check that the page is open and call page.tabs.list({}) before deciding whether to retry.`
  return Tool.toolError({message, metadata: {code: 'not_dispatched', message}, error})
}

function timedOut(action: Work, timeoutMs: number) {
  const message = `[page.timeout] page.${workName(action)} did not finish within ${timeoutMs / 1000} seconds; its outcome is unknown. Call page.tabs.list({}) and inspect the page before you repeat a changing action.`
  return Tool.toolError({message, metadata: {code: 'timeout', message}})
}

const SessionNotFound = Predicate.isTagged('Session.NotFoundError')

export function queueJobNotice(
  job: {readonly id: string; readonly status: string; readonly output?: string; readonly error?: string},
  queueId: string,
) {
  const state = job.status === 'running' ? 'cancelled' : job.status
  const body = job.status === 'running' ? 'Interrupted by server restart.' : (job.output ?? job.error ?? state)
  return {
    description: `Queued page actions ${state}`,
    text: body,
    metadata: {source: 'page-queue', jobID: job.id, queueId, state},
  }
}

const withLane = <K, A, E>(lanes: RcMap.RcMap<K, Semaphore.Semaphore>, key: K, effect: Effect.Effect<A, E>) =>
  RcMap.get(lanes, key).pipe(
    Effect.flatMap((lane) => lane.withPermit(effect)),
    Effect.scoped,
  )

export const make = Effect.fn('PageConnection.make')(function* (
  ctx: Pick<
    Context,
    'agent' | 'rpc' | 'session' | 'browserTabs' | 'job' | 'location' | 'event' | 'storage' | 'options'
  >,
  symbolicator: Symbolicator,
  grabs: GrabStore,
) {
  const {pageReplyTimeoutMs, queuedActionTimeoutMs, permissionSyncTimeoutMs} = Windows.parse(ctx.options)
  yield* ctx.agent.transform((editor) =>
    editor
      .list()
      .forEach((agent) => agent.permissions.push(...ACCESS.map((rule) => ({...rule, effect: 'deny' as const})))),
  )
  const work = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(work, exit))
  const records = fromStorage(ctx.storage)
  const calls = yield* RcMap.make({
    lookup: (_call: PageCall) => Effect.all({reply: Deferred.make<Outcome>(), gone: Deferred.make<void>()}),
  }).pipe(Scope.provide(work))
  const lanes = yield* RcMap.make({lookup: (_sessionId: SessionId) => Semaphore.make(1)}).pipe(Scope.provide(work))
  const grants = yield* RcMap.make({lookup: (_sessionId: SessionId) => Semaphore.make(1)}).pipe(Scope.provide(work))

  const syncPermissions = (sessionId: SessionId, allow?: boolean) =>
    withLane(
      grants,
      sessionId,
      Effect.gen(function* () {
        const open = allow ?? (yield* ctx.browserTabs.list(sessionId)).tabs.length > 0
        const session = yield* ctx.session.get({sessionId})
        const permissions = reconcilePagePermissions(session.permissions, open)
        if (permissions) yield* ctx.session.update({sessionId, permissions})
      }),
    ).pipe(
      Effect.timeoutOption(Duration.millis(permissionSyncTimeoutMs)),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.logWarning(`Page permission sync for ${sessionId} timed out`),
          onSome: () => Effect.void,
        }),
      ),
      Effect.catchIf(SessionNotFound, () => Effect.void),
      Effect.catchCause((cause) => Effect.logWarning(`Page permission sync for ${sessionId} failed`, cause)),
    )

  const emitCancel = (tabId: string, requestId: string) =>
    registration.events
      .emit('control', {type: 'cancel', tabId, requestId})
      .pipe(Effect.catchCause((cause) => Effect.logWarning('Cancelling a page request failed', cause)))

  const pendingCall = (requestId: string) =>
    RcMap.keys(calls).pipe(Effect.map((keys) => Arr.findFirst(keys, (call) => call.requestId === requestId)))

  const ownedBy = (call: PageCall, owner: Target) => call.sessionId === owner.sessionId && call.tabId === owner.tabId

  const ended = (gone: (call: PageCall) => boolean) =>
    RcMap.keys(calls).pipe(
      Effect.flatMap((keys) =>
        Effect.forEach(
          Arr.filter(keys, gone),
          (call) =>
            RcMap.getOption(calls, call).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => Effect.void,
                  onSome: (pending) => Deferred.succeed(pending.gone, undefined),
                }),
              ),
              Effect.scoped,
            ),
          {discard: true},
        ),
      ),
    )

  const exchange = (call: PageCall): Effect.Effect<Result, PageError> =>
    Effect.gen(function* () {
      const pending = yield* RcMap.get(calls, call)
      const listed = yield* ctx.browserTabs.list(call.sessionId)
      if (!listed.tabs.some((tab) => tab.id === call.tabId) || (yield* Deferred.isDone(pending.gone)))
        return yield* Effect.fail(makeTabGone({dispatched: false}))
      if (yield* Deferred.isDone(pending.reply)) return yield* Effect.interrupt
      yield* registration.events
        .emit('control', {type: 'command', tabId: call.tabId, requestId: call.requestId})
        .pipe(Effect.mapError((error) => dispatchFailed(call.command.action, error)))
      const outcome = yield* Effect.raceFirst(
        Deferred.await(pending.reply),
        Deferred.await(pending.gone).pipe(Effect.andThen(Effect.fail(makeTabGone({dispatched: true})))),
      ).pipe(
        Effect.timeoutOrElse({
          duration: Duration.millis(call.command.timeoutMs),
          orElse: () =>
            emitCancel(call.tabId, call.requestId).pipe(
              Effect.andThen(Effect.fail(timedOut(call.command.action, call.command.timeoutMs))),
            ),
        }),
      )
      if (outcome.type === 'failure') return yield* Effect.fail(failedOutcome(outcome))
      return outcome.result
    }).pipe(Effect.scoped)

  const resolver = RequestResolver.make<PageCall>((entries) =>
    Effect.forEach(entries, (entry) => Request.completeEffect(entry, exchange(entry.request)), {
      concurrency: 'unbounded',
      discard: true,
    }),
  )

  const cancelled = (requestId: string) =>
    Effect.gen(function* () {
      const pending = yield* pendingCall(requestId)
      if (Option.isNone(pending)) return
      const entry = yield* RcMap.getOption(calls, pending.value)
      yield* emitCancel(pending.value.tabId, requestId)
      if (Option.isSome(entry)) yield* Deferred.interrupt(entry.value.reply)
    }).pipe(Effect.scoped)

  const deliver = (target: Target, command: Command) => {
    const requestId = crypto.randomUUID()
    return Effect.request(new PageCall({...target, requestId, command}), resolver).pipe(
      Effect.onInterrupt(() => cancelled(requestId)),
    )
  }

  const selected = (sessionId: SessionId, tabId: string | undefined): Effect.Effect<Target, Tool.Error> =>
    ctx.browserTabs.list(sessionId).pipe(
      Effect.flatMap((list) => {
        const chosen = selectTarget(list, tabId)
        return chosen.ok ? Effect.succeed({sessionId, tabId: chosen.tab.id}) : Effect.fail(chosen.error)
      }),
    )

  const servingAgain = (sessionId: SessionId, tabId: string | undefined, remainingMs: number) =>
    selected(sessionId, tabId).pipe(
      Effect.retry({schedule: TAB_RETURN_POLL}),
      Effect.timeoutOption(Duration.millis(remainingMs)),
      Effect.map(Option.getOrUndefined),
      Effect.catch(() => Effect.succeed(undefined)),
    )

  const serialized = <A, E>(sessionId: SessionId, effect: Effect.Effect<A, E>) => withLane(lanes, sessionId, effect)

  const resent = (call: Call, command: Command, deadline: number, first: PageError) =>
    Effect.gen(function* () {
      const remaining = Math.max(Math.min(TAB_RETURN_MS, deadline - Date.now()), 0)
      const returned = yield* servingAgain(call.sessionId, call.tabId, remaining)
      if (!returned) return yield* Effect.fail(first)
      return yield* deliver(returned, {...command, timeoutMs: Math.max(deadline - Date.now(), 1)})
    })

  const run = (call: Call): Effect.Effect<Result, PageError> =>
    Effect.gen(function* () {
      const target = yield* selected(call.sessionId, call.tabId)
      const command: Command = {
        action: call.action,
        agentId: call.agentId,
        timeoutMs: call.timeoutMs ?? callTimeout(call.action, pageReplyTimeoutMs),
      }
      const deadline = Date.now() + command.timeoutMs
      const sent = deliver(target, command)
      if (!call.reading) return yield* serialized(call.sessionId, sent)
      return yield* sent.pipe(
        Effect.catchTag('PageTabGone', (gone) =>
          gone.dispatched ? resent(call, command, deadline, gone) : Effect.fail(gone),
        ),
      )
    })

  const playQueue = Effect.fn('PageConnection.playQueue')(function* (
    sessionId: SessionId,
    play: {
      readonly action: Action
      readonly agentId: string
      readonly queueId: string
      readonly actions: readonly Action[]
    },
  ) {
    const tabId = play.action.type === 'tabs.list' ? undefined : play.action.tabId
    yield* selected(sessionId, tabId).pipe(Effect.mapError(raise))
    const of = play.actions.length
    const played = yield* Effect.forEach(play.actions, (action) =>
      Deferred.make<PageQueue.RequestSettlement>().pipe(Effect.map((reply) => ({action, reply}))),
    )
    const settleAll = (landed: PageQueue.RequestSettlement) =>
      Effect.forEach(played, ({reply}) => Deferred.succeed(reply, landed), {discard: true})
    const playing = Effect.gen(function* () {
      const target = yield* selected(sessionId, tabId)
      const send = (action: Action, index: number, timeoutMs: number) =>
        deliver(target, {action, agentId: play.agentId, timeoutMs, queued: {id: play.queueId, index, of}}).pipe(
          Effect.exit,
          Effect.map(settlement),
        )
      const acceptance = yield* send(play.action, -1, pageReplyTimeoutMs)
      yield* Effect.forEach(
        played,
        ({action, reply}, index) =>
          (acceptance.ok
            ? send(action, index, queuedActionTimeoutMs).pipe(
                Effect.onInterrupt(() =>
                  Deferred.succeed(reply, {ok: false, error: disconnectedAfterDispatch(), tabClosed: true}),
                ),
              )
            : Effect.succeed(refused(acceptance.error))
          ).pipe(Effect.flatMap((landed) => Deferred.succeed(reply, landed))),
        {discard: true},
      )
    })
    yield* Effect.forkIn(
      serialized(sessionId, playing.pipe(Effect.catch((error) => settleAll(refused(error))))).pipe(
        Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : settleAll(stopped()))),
      ),
      work,
    )
    return played.map(({reply}) => reply)
  })

  const queues: PageQueue.Queues = yield* PageQueue.makeQueues({
    play: playQueue,
    journal: (sessionId, change) => records.append(sessionId, change),
    started: (entry) =>
      Effect.gen(function* () {
        const id = `pq_${entry.queueId}`
        yield* ctx.job.start({
          id,
          type: 'page-queue',
          title: 'Queued page actions',
          metadata: {toolCallId: entry.toolCallId, origin: entry.origin},
          recovery: {kind: 'page-queue', sessionID: entry.sessionId, queueId: entry.queueId},
          background: true,
          run: Deferred.await(entry.done).pipe(Effect.map(queueNotice)),
        })
        if (entry.origin === 'hub') return
        yield* ctx.job.wait({id}).pipe(
          Effect.flatMap(({info}) =>
            info === undefined || info.status === 'cancelled'
              ? Effect.void
              : ctx.session.synthetic({sessionID: entry.sessionId, ...queueJobNotice(info, entry.queueId)}),
          ),
          Effect.catchCause((cause) => Effect.logWarning(`Queue ${entry.queueId} could not reach its session`, cause)),
          Effect.forkIn(work),
        )
      }).pipe(Effect.catchCause((cause) => Effect.logWarning(`Queue ${entry.queueId} could not start its job`, cause))),
    finished: (entry) => {
      if (entry.result === null) return Effect.void
      const {sessionId, queueId, toolCallId, result} = entry
      return Effect.forkIn(
        queues.settle(sessionId, [queueId]).pipe(
          Effect.andThen(registration.events.emit('queue.finished', {sessionId, queueId, toolCallId, result})),
          Effect.catchCause((cause) => Effect.logWarning(`Announcing queue ${queueId} failed`, cause)),
        ),
        work,
      ).pipe(Effect.asVoid)
    },
  }).pipe(Scope.provide(work))

  const registration: RpcRegistration<typeof Definition> = yield* ctx.rpc
    .register(Definition, {
      command: (input, call) =>
        pendingCall(input.requestId).pipe(
          Effect.flatMap((pending) =>
            Option.isSome(pending) && ownedBy(pending.value, input)
              ? Effect.succeed(pending.value.command)
              : Effect.fail(call.error('unavailable', 'Page request is no longer available.', {})),
          ),
        ),
      result: (input, call) =>
        Effect.gen(function* () {
          if (input.outcome.type === 'failure' && TRANSPORT_CODES.includes(input.outcome.code))
            return yield* Effect.fail(
              call.error('unavailable', `The page cannot report ${input.outcome.code}; only the engine does.`, {}),
            )
          const pending = yield* pendingCall(input.requestId)
          if (Option.isNone(pending) || !ownedBy(pending.value, input)) return
          const entry = yield* RcMap.getOption(calls, pending.value)
          if (Option.isSome(entry)) yield* Deferred.succeed(entry.value.reply, input.outcome)
        }).pipe(Effect.scoped),
      operate: (input, call) =>
        run({
          sessionId: input.sessionId,
          tabId: input.tabId,
          action: {type: 'operation', name: input.name, input: input.input},
          reading: input.reading,
          agentId: 'engine',
        }).pipe(
          Effect.map((result) => result.value),
          Effect.mapError((error) => {
            if (!Tool.isToolError(error))
              return call.error('tab_gone', toolFailure(error).message, {dispatched: error.dispatched})
            const raised = PageRaisedErrorSchema.safeParse(error.error)
            return call.error('failed', error.message, {
              code: readPageCode(error),
              ...(raised.success ? {raised: raised.data} : {}),
            })
          }),
        ),
      'hmr.wait': (input, call) =>
        run({
          sessionId: input.sessionId,
          tabId: undefined,
          action: {type: 'hmr', timeout: input.timeout},
          reading: true,
          agentId: 'engine',
        }).pipe(
          Effect.flatMap((result) =>
            Effect.try({
              try: () => Definition.methods['hmr.wait'].output.parse(result.value),
              catch: (error) => Tool.toolError({message: `The page answered hmr.wait badly: ${String(error)}`}),
            }),
          ),
          Effect.mapError((error) => call.error('unavailable', toolFailure(error).message, {})),
        ),
      'captures.list': (input) => records.captures(input.sessionId),
      'grabs.save': (input, call) =>
        grabs.save(input.grab).pipe(
          Effect.map((id) => ({id})),
          Effect.catch((error) =>
            Effect.logWarning('Saving a grabbed element failed', error).pipe(
              Effect.andThen(Effect.fail(call.error('unavailable', 'The grabbed element could not be saved.', {}))),
            ),
          ),
        ),
      'grabs.get': (input) => grabs.get(input.id),
      symbolicate: (input) => symbolicator.frames(input.frames),
      'queue.wait': (input, call) =>
        queues
          .wait(input.sessionId, input.queueId, input.waitMs)
          .pipe(Effect.mapError((error) => call.error('unavailable', error.message, {}))),
    })
    .pipe(Effect.orDie)

  const deleted = (sessionId: SessionId) =>
    Effect.gen(function* () {
      yield* RcMap.invalidate(lanes, sessionId)
      yield* RcMap.invalidate(grants, sessionId)
      yield* queues.cancelSession(sessionId)
      const owned = Arr.filter(yield* RcMap.keys(calls), (call) => call.sessionId === sessionId)
      yield* Effect.forEach(owned, ({tabId, requestId}) => emitCancel(tabId, requestId), {discard: true})
      yield* ended((call) => call.sessionId === sessionId)
      yield* records.forget(sessionId)
    })

  yield* ctx.event.subscribe({types: ['tab.opened', 'tab.closed', 'session.deleted']}).pipe(
    Stream.runForEach((event) =>
      event.type === 'session.deleted'
        ? deleted(event.data.sessionID)
        : ended((call) => call.tabId === event.data.tabId).pipe(
            Effect.andThen(Effect.forkIn(syncPermissions(event.data.sessionID), work)),
            Effect.asVoid,
          ),
    ),
    Effect.catchCause((cause) => Effect.logWarning('Page stopped following browser tabs', cause)),
    Effect.forkScoped({startImmediately: true}),
  )
  yield* ctx.browserTabs
    .sessions()
    .pipe(
      Effect.flatMap((open) =>
        Effect.forEach(open, (sessionId) => Effect.forkIn(syncPermissions(sessionId), work), {discard: true}),
      ),
    )
  yield* Effect.addFinalizer(() =>
    ctx.browserTabs.sessions().pipe(
      Effect.flatMap((open) =>
        Effect.forEach(open, (sessionId) => syncPermissions(sessionId, false), {
          concurrency: 'unbounded',
          discard: true,
        }),
      ),
    ),
  )

  return {
    run,
    queues,
    records: {
      ...records,
      capture: (sessionId: SessionId, toolCallId: string, bundle: PageCaptureBundle) =>
        records
          .capture(sessionId, toolCallId, bundle)
          .pipe(Effect.andThen(registration.events.emit('captures.saved', {sessionId}))),
    },
  }
})

const Change = PageChangeEntrySchema.omit({seq: true})
const Stored = z.json()

export function fromStorage(storage: Context['storage']) {
  const every = (prefix: string, after?: string): Effect.Effect<StorageEntry[]> =>
    storage
      .scan({prefix, ...(after === undefined ? {} : {after})})
      .pipe(
        Effect.flatMap((page) =>
          page.next === undefined
            ? Effect.succeed([...page.entries])
            : every(prefix, page.next).pipe(Effect.map((rest) => [...page.entries, ...rest])),
        ),
      )
  const remove = (entries: readonly StorageEntry[]) =>
    Effect.forEach(entries, (entry) => storage.remove(entry.key), {concurrency: 'unbounded', discard: true})
  return {
    append: (sessionId: SessionId, change: Omit<PageChangeEntry, 'seq'>) =>
      Effect.suspend(() =>
        storage.set(
          `changes/${sessionId}/${String(change.ts).padStart(16, '0')}-${crypto.randomUUID()}`,
          Stored.parse(change),
        ),
      ).pipe(
        Effect.withSpan('PageConnection.change', {
          attributes: {verb: change.verb, element: change.ref ?? change.selector, args: change.args},
        }),
      ),
    changes: (sessionId: SessionId): Effect.Effect<PageChangeEntry[]> =>
      every(`changes/${sessionId}/`).pipe(
        Effect.map((entries) => entries.map((entry, index) => ({...Change.parse(entry.value), seq: index + 1}))),
      ),
    capture: (sessionId: SessionId, toolCallId: string, bundle: PageCaptureBundle) =>
      Effect.suspend(() => storage.set(`captures/${sessionId}/${toolCallId}`, Stored.parse(bundle))),
    captures: (sessionId: SessionId): Effect.Effect<SessionCaptures> =>
      every(`captures/${sessionId}/`).pipe(
        Effect.map((entries) => {
          const stored = entries.map((entry) => ({
            toolCallId: entry.key.slice(`captures/${sessionId}/`.length),
            bundle: PageCaptureBundleSchema.parse(entry.value),
          }))
          return {
            captures: stored.flatMap(({toolCallId, bundle}) =>
              [bundle.before, bundle.after].flatMap((capture) =>
                capture ? [{toolCallId, kind: capture.kind, capture}] : [],
              ),
            ),
            cssBundles: Object.fromEntries(
              stored.flatMap(({bundle}) => (bundle.cssBundles ?? []).map((css) => [css.hash, css.css])),
            ),
          }
        }),
      ),
    clear: (sessionId: SessionId) => every(`changes/${sessionId}/`).pipe(Effect.flatMap(remove)),
    forget: (sessionId: SessionId) =>
      Effect.all([every(`changes/${sessionId}/`), every(`captures/${sessionId}/`)]).pipe(
        Effect.flatMap(([changes, captures]) => remove([...changes, ...captures])),
      ),
  }
}
