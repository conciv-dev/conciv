import {Cause, Deferred, Duration, Effect, Exit, Option, Scope, Semaphore, Stream} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/plugin/effect/plugin'
import type {RpcHandlers, RpcRegistration} from '@conciv/plugin/effect/rpc'
import type {Tool} from '@conciv/plugin/schema/tool'
import type {SessionId} from '@conciv/protocol/chat-types'
import {
  ACCESS,
  PERMISSION_SYNC_TIMEOUT_MS,
  createConnectionState,
  isAttachedConnection,
  isConnectionDisposed,
  reconcileTanstackPermissions,
  selectNextAttempt,
  selectPendingCommand,
  selectTabs,
  selectTarget,
  transitionConnection,
  type ConnectionEffect,
  type ConnectionEvent,
} from './machine.js'
import {ENGINE_CODES} from './failures.js'
import {Definition, type Action, type Result} from './rpc.js'

const Options = z.object({replyTimeoutMs: z.number().int().positive().default(5000)})

const SessionNotFound = z.object({_tag: z.literal('Session.NotFoundError')})

function refusalReason(sessionId: SessionId, error: unknown): Effect.Effect<string> {
  if (SessionNotFound.safeParse(error).success) return Effect.succeed(`session "${sessionId}" does not exist`)
  return Effect.logWarning(`TanStack could not open session ${sessionId}`, error).pipe(
    Effect.as(`Session ${sessionId} could not be opened: ${error instanceof Error ? error.message : String(error)}`),
  )
}

type SyncEffect = Extract<ConnectionEffect, {readonly type: 'sync-permissions'}>

export type Connection = Effect.Success<ReturnType<typeof make>>

type EngineHandlers = Pick<RpcHandlers<typeof Definition>, 'buildErrors' | 'routeManifest' | 'serverFnTrace'>

export const make = Effect.fn('TanstackConnection.make')(function* (
  ctx: Pick<Context, 'agent' | 'rpc' | 'session' | 'location' | 'event' | 'options'>,
  engine: EngineHandlers,
) {
  const {replyTimeoutMs} = Options.parse(ctx.options)
  yield* ctx.agent.transform((editor) =>
    editor
      .list()
      .forEach((agent) => agent.permissions.push(...ACCESS.map((rule) => ({...rule, effect: 'deny' as const})))),
  )
  const work = yield* Scope.make()
  yield* Effect.addFinalizer((exit) => Scope.close(work, exit))
  const machine = {state: createConnectionState()}
  const attachments = new Map<number, Deferred.Deferred<'closed' | 'replaced', 'unavailable'>>()
  const requests = new Map<string, Deferred.Deferred<Result, Tool.Error>>()
  const drained = Deferred.makeUnsafe<void>()
  const lock = Semaphore.makeUnsafe(1)
  const step = (event: ConnectionEvent): Effect.Effect<void> =>
    Effect.suspend(() => {
      const next = transitionConnection(machine.state, event)
      machine.state = next.state
      return Effect.forEach(
        next.effects,
        (effect) =>
          perform(effect).pipe(Effect.catchCause((cause) => Effect.logWarning('TanStack effect failed', cause))),
        {discard: true},
      )
    })
  const dispatch = (event: ConnectionEvent) => lock.withPermit(step(event))
  const perform = (effect: ConnectionEffect): Effect.Effect<void, unknown> => {
    if (effect.type === 'sync-permissions') return Effect.asVoid(Effect.forkIn(syncPermissions(effect), work))
    if (effect.type === 'close-attachment')
      return Effect.suspend(() => {
        const closed = attachments.get(effect.attempt)
        if (!closed) return Effect.void
        attachments.delete(effect.attempt)
        return Deferred.done(
          closed,
          effect.outcome === 'unavailable' ? Exit.fail(effect.outcome) : Exit.succeed(effect.outcome),
        ).pipe(Effect.asVoid)
      })
    if (effect.type === 'emit-control') return rpc.events.emit('control', effect.control)
    if (effect.type === 'dispatch-command')
      return rpc.events
        .emit('control', {type: 'command', connectionId: effect.connectionId, requestId: effect.requestId})
        .pipe(Effect.catch((error) => step({...effect, type: 'request.dispatch-failed', error})))
    if (effect.type === 'settle-request')
      return Effect.suspend(() => {
        const result = requests.get(effect.requestId)
        if (!result) return Effect.void
        requests.delete(effect.requestId)
        return Deferred.done(
          result,
          effect.settlement.ok ? Exit.succeed(effect.settlement.result) : Exit.fail(effect.settlement.error),
        ).pipe(Effect.asVoid)
      })
    if (effect.type === 'warn') return Effect.logWarning(effect.message, effect.error)
    return Deferred.done(drained, Exit.void).pipe(Effect.asVoid)
  }
  const syncPermissions = (effect: SyncEffect) =>
    ctx.session.get({sessionId: effect.sessionId}).pipe(
      Effect.flatMap((session) => {
        const permissions = reconcileTanstackPermissions(session.permissions, effect.allow)
        return permissions ? ctx.session.update({sessionId: effect.sessionId, permissions}) : Effect.void
      }),
      Effect.timeoutOption(Duration.millis(PERMISSION_SYNC_TIMEOUT_MS)),
      Effect.matchCauseEffect({
        onSuccess: (done) =>
          dispatch({
            type: Option.isSome(done) ? 'permissions.synced' : 'permissions.timed-out',
            sessionId: effect.sessionId,
            attempt: effect.attempt,
          }),
        onFailure: (cause) =>
          dispatch({
            type: 'permissions.failed',
            sessionId: effect.sessionId,
            attempt: effect.attempt,
            error: Cause.squash(cause),
          }),
      }),
    )
  const rpc: RpcRegistration<typeof Definition> = yield* ctx.rpc
    .register(Definition, {
      ...engine,
      attach: (input, call) =>
        Effect.gen(function* () {
          const session = yield* ctx.session
            .get({sessionId: input.sessionId})
            .pipe(
              Effect.catch((error) =>
                refusalReason(input.sessionId, error).pipe(
                  Effect.flatMap((reason) =>
                    Effect.fail(
                      SessionNotFound.safeParse(error).success
                        ? call.error('missing', reason, {})
                        : call.error('unavailable', reason, {}),
                    ),
                  ),
                ),
              ),
            )
          if (session.location.directory !== ctx.location.directory)
            return yield* Effect.fail(call.error('unavailable', 'Session belongs to another location.', {}))
          return yield* Effect.acquireUseRelease(
            lock.withPermit(
              Effect.suspend(() => {
                if (isConnectionDisposed(machine.state))
                  return Effect.fail(call.error('unavailable', 'TanStack is unavailable.', {}))
                const attempt = selectNextAttempt(machine.state)
                const closed = Deferred.makeUnsafe<'closed' | 'replaced', 'unavailable'>()
                attachments.set(attempt, closed)
                return step({
                  type: 'attach.started',
                  sessionId: input.sessionId,
                  attempt,
                  connectionId: input.connectionId,
                }).pipe(Effect.as({attempt, closed}))
              }),
            ),
            (attached) =>
              Deferred.await(attached.closed).pipe(
                Effect.mapError(() => call.error('unavailable', 'TanStack permissions could not be granted.', {})),
              ),
            (attached) => dispatch({type: 'attach.closed', sessionId: input.sessionId, attempt: attached.attempt}),
          )
        }),
      state: (input, call) =>
        Effect.suspend(() =>
          isAttachedConnection(machine.state, input.sessionId, input.connectionId)
            ? dispatch({
                type: 'state.updated',
                sessionId: input.sessionId,
                connectionId: input.connectionId,
                tab: input.state,
              })
            : Effect.fail(call.error('unavailable', 'TanStack is unavailable.', {})),
        ),
      command: (input, call) =>
        Effect.suspend(() => {
          const command = selectPendingCommand(machine.state, input.sessionId, input.connectionId, input.requestId)
          return command
            ? Effect.succeed(command)
            : Effect.fail(call.error('unavailable', 'TanStack request is no longer available.', {}))
        }),
      result: (input, call) =>
        Effect.suspend(() => {
          if (input.outcome.type === 'failure' && ENGINE_CODES.includes(input.outcome.code))
            return Effect.fail(
              call.error('unavailable', `The page cannot report ${input.outcome.code}; only the engine does.`, {}),
            )
          return isAttachedConnection(machine.state, input.sessionId, input.connectionId)
            ? dispatch({type: 'request.settled', ...input})
            : Effect.fail(call.error('unavailable', 'TanStack is unavailable.', {}))
        }),
      'tabs.list': (input) => Effect.sync(() => selectTabs(machine.state, input.sessionId)),
    })
    .pipe(Effect.orDie)
  yield* ctx.event.subscribe({types: ['session.deleted']}).pipe(
    Stream.runForEach((event) => dispatch({type: 'session.deleted', sessionId: event.data.sessionID})),
    Effect.forkScoped({startImmediately: true}),
  )
  yield* Effect.addFinalizer(() => dispatch({type: 'disposed'}).pipe(Effect.andThen(Deferred.await(drained))))

  const request = Effect.fn('TanstackConnection.request')(function* (
    sessionId: SessionId,
    connectionId: string,
    action: Action,
  ) {
    const requestId = crypto.randomUUID()
    const target = {sessionId, connectionId, requestId}
    const result = yield* Deferred.make<Result, Tool.Error>()
    const command = {action, timeoutMs: replyTimeoutMs}
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.sync(() => requests.set(requestId, result)).pipe(
        Effect.andThen(dispatch({type: 'request.started', ...target, command})),
        Effect.andThen(
          restore(
            Deferred.await(result).pipe(
              Effect.timeoutOrElse({
                duration: Duration.millis(replyTimeoutMs),
                orElse: () =>
                  dispatch({type: 'request.timed-out', ...target}).pipe(Effect.andThen(Deferred.await(result))),
              }),
            ),
          ),
        ),
        Effect.onInterrupt(() => dispatch({type: 'request.cancelled', ...target})),
        Effect.ensuring(Effect.sync(() => requests.delete(requestId))),
      ),
    )
  })

  return {
    tabs: (sessionId: SessionId) => selectTabs(machine.state, sessionId),
    request: Effect.fn('TanstackConnection.target')(function* (sessionId: SessionId, action: Action) {
      const selected = selectTarget(machine.state, sessionId, action)
      if (!selected.ok) return yield* Effect.fail(selected.error)
      return yield* request(sessionId, selected.connectionId, action)
    }),
  }
})
