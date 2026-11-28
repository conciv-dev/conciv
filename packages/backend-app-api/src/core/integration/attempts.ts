import {Cause, Clock, Duration, Effect, Exit, Fiber, Redacted, Schedule, Scope, Stream, SynchronizedRef} from 'effect'
import {ChildProcess} from 'effect/process'
import {ChildProcessSpawner} from 'effect/process/ChildProcessSpawner'
import * as IntegrationSchema from '@conciv/protocol/schema/integration'
import type * as Identifier from '@conciv/protocol/schema/identifier'
import {integrationErrors} from '@conciv/errors'
import type {EvlogError} from 'evlog'
import * as Credential from '../credential.js'
import type * as Form from '../form.js'
import type {AnswerCheck, OAuthAuthorization, OAuthImplementation} from './implementation.js'

type Id = IntegrationSchema.Id
type MethodId = IntegrationSchema.MethodId
type AttemptId = IntegrationSchema.AttemptId

const attemptLifetime = Duration.toMillis(Duration.minutes(10))
const terminalRetention = Duration.toMillis(Duration.minutes(1))
const scrubInterval = Duration.seconds(30)

type AttemptTime = {created: number; expires: number}
type PendingAttempt = {
  status: 'pending'
  completing: boolean
  persisting: boolean
  authorization: OAuthAuthorization
  integrationId: Id
  methodId: MethodId
  label?: string
  scope: Scope.Closeable
  time: AttemptTime
}
type TerminalAttempt = {
  status: 'complete' | 'failed' | 'expired'
  integrationId: Id
  message?: string
  removeAt: number
  time: AttemptTime
}
type AttemptEntry = PendingAttempt | TerminalAttempt

type PendingCommandAttempt = {
  status: 'pending'
  integrationId: Id
  label?: string
  message?: string
  persisting: boolean
  scope: Scope.Closeable
  time: AttemptTime
}
type CommandAttemptEntry = PendingCommandAttempt | TerminalAttempt

type AttemptRef<Pending> = SynchronizedRef.SynchronizedRef<Map<AttemptId, Pending | TerminalAttempt>>

type AttemptInput = {readonly integrationId: Id; readonly attemptId: AttemptId}

export interface AttemptDeps {
  readonly scope: Scope.Scope
  readonly ids: Identifier.Maker
  readonly spawner: ChildProcessSpawner['Service']
  readonly createCredential: (
    input: Parameters<Credential.Interface['create']>[0],
  ) => Effect.Effect<Credential.Info, EvlogError>
  readonly oauthMethod: (integrationId: Id, methodId: MethodId) => OAuthImplementation | undefined
  readonly commandMethod: (integrationId: Id, methodId: MethodId) => IntegrationSchema.CommandMethod | undefined
  readonly answerError: AnswerCheck
}

export const authorize = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((cause) => authorizationError(cause)))

export function authorizationError(cause: unknown): EvlogError {
  const reason = cause instanceof Error && cause.message ? cause.message : 'Authorization failed'
  return cause instanceof Error
    ? integrationErrors.AUTHORIZATION({reason, cause})
    : integrationErrors.AUTHORIZATION({reason, internal: {cause: String(cause)}})
}

const message = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause)
  return error instanceof Error ? error.message : String(error)
}

export const makeAttempts = Effect.fnUntraced(function* (deps: AttemptDeps) {
  const {scope} = deps
  const attempts = SynchronizedRef.makeUnsafe(new Map<AttemptId, AttemptEntry>())
  const commandAttempts = SynchronizedRef.makeUnsafe(new Map<AttemptId, CommandAttemptEntry>())

  const close = (attemptScope: Scope.Closeable) =>
    Scope.close(attemptScope, Exit.void).pipe(Effect.forkIn(scope, {startImmediately: true}), Effect.asVoid)

  const claim = Effect.fnUntraced(function* <Pending extends PendingAttempt | PendingCommandAttempt>(
    ref: AttemptRef<Pending>,
    attemptId: AttemptId,
    exit: Exit.Exit<unknown, unknown>,
  ) {
    const now = yield* Clock.currentTimeMillis
    const attempt = yield* SynchronizedRef.modify(ref, (current) => {
      const match = current.get(attemptId)
      if (!match || match.status !== 'pending' || match.persisting) return [undefined, current]
      const next: Pending | TerminalAttempt = Exit.isSuccess(exit)
        ? {...match, persisting: true}
        : {
            status: 'failed',
            integrationId: match.integrationId,
            message: message(exit.cause),
            time: match.time,
            removeAt: now + terminalRetention,
          }
      return [match, new Map(current).set(attemptId, next)]
    })
    if (attempt && Exit.isFailure(exit)) yield* close(attempt.scope)
    return attempt
  })

  const record = Effect.fnUntraced(function* <Pending extends PendingAttempt | PendingCommandAttempt>(
    ref: AttemptRef<Pending>,
    attemptId: AttemptId,
    attempt: Pending,
    persistence: Exit.Exit<void, unknown>,
  ) {
    const settledAt = yield* Clock.currentTimeMillis
    const terminal: TerminalAttempt = Exit.isSuccess(persistence)
      ? {
          status: 'complete',
          integrationId: attempt.integrationId,
          time: attempt.time,
          removeAt: settledAt + terminalRetention,
        }
      : {
          status: 'failed',
          integrationId: attempt.integrationId,
          message: message(persistence.cause),
          time: attempt.time,
          removeAt: settledAt + terminalRetention,
        }
    yield* SynchronizedRef.update(ref, (current) => new Map(current).set(attemptId, terminal))
  })

  const settle = Effect.fnUntraced(function* (attemptId: AttemptId, exit: Exit.Exit<Credential.OAuth, unknown>) {
    const attempt = yield* claim(attempts, attemptId, exit)
    if (!attempt || Exit.isFailure(exit)) return
    yield* Effect.gen(function* () {
      const persistence = yield* Effect.suspend(() => {
        const implementation = deps.oauthMethod(attempt.integrationId, attempt.methodId)
        return deps.createCredential({
          integrationId: attempt.integrationId,
          label: attempt.label ?? implementation?.label?.(exit.value),
          value: exit.value,
        })
      }).pipe(Effect.asVoid, Effect.exit)
      yield* record(attempts, attemptId, attempt, persistence)
      yield* persistence
    }).pipe(Effect.ensuring(close(attempt.scope)))
  }, Effect.uninterruptible)

  const settleCommand = Effect.fnUntraced(function* (
    attemptId: AttemptId,
    exit: Exit.Exit<Redacted.Redacted<string>, unknown>,
  ) {
    const attempt = yield* claim(commandAttempts, attemptId, exit)
    if (!attempt || Exit.isFailure(exit)) return
    const persistence = yield* deps
      .createCredential({
        integrationId: attempt.integrationId,
        label: attempt.label,
        value: Credential.Key.make({type: 'key', key: exit.value}),
      })
      .pipe(Effect.asVoid, Effect.exit)
    yield* record(commandAttempts, attemptId, attempt, persistence)
    yield* close(attempt.scope)
  }, Effect.uninterruptible)

  const scrub = Effect.fnUntraced(function* <Pending extends PendingAttempt | PendingCommandAttempt>(
    ref: AttemptRef<Pending>,
    expire: (attemptId: AttemptId, attempt: Pending) => Effect.Effect<void>,
  ) {
    const now = yield* Clock.currentTimeMillis
    const expired = yield* SynchronizedRef.modify(ref, (current) => {
      const next = new Map(current)
      const closed: [AttemptId, Pending][] = []
      for (const [id, attempt] of current) {
        if (attempt.status === 'pending' && !attempt.persisting && attempt.time.expires <= now) {
          closed.push([id, attempt])
          next.set(id, {
            status: 'expired',
            integrationId: attempt.integrationId,
            time: attempt.time,
            removeAt: now + terminalRetention,
          })
          continue
        }
        if (attempt.status !== 'pending' && attempt.removeAt <= now) next.delete(id)
      }
      return [closed, next]
    })
    yield* Effect.forEach(expired, ([id, attempt]) => expire(id, attempt), {discard: true})
  })

  const cancel = Effect.fnUntraced(function* <Pending extends PendingAttempt | PendingCommandAttempt>(
    ref: AttemptRef<Pending>,
    input: AttemptInput,
    before: Effect.Effect<void> = Effect.void,
  ) {
    const attempt = yield* SynchronizedRef.modify(ref, (current) => {
      const match = current.get(input.attemptId)
      if (!match || match.integrationId !== input.integrationId || match.status !== 'pending' || match.persisting)
        return [undefined, current]
      const next = new Map(current)
      next.delete(input.attemptId)
      return [match, next]
    })
    if (!attempt) return
    yield* before
    yield* Scope.close(attempt.scope, Exit.void)
  })

  yield* scrub(attempts, (attemptId, attempt) =>
    Effect.logInfo('integration oauth attempt closed', {
      integrationId: attempt.integrationId,
      attemptId,
      reason: 'expired',
    }).pipe(Effect.andThen(close(attempt.scope))),
  ).pipe(Effect.repeat(Schedule.spaced(scrubInterval)), Effect.forkIn(scope))
  yield* scrub(commandAttempts, (_, attempt) => close(attempt.scope)).pipe(
    Effect.repeat(Schedule.spaced(scrubInterval)),
    Effect.forkIn(scope),
  )

  const connectOAuth = Effect.fn('Integration.oauth.connect')(function* (input: {
    readonly integrationId: Id
    readonly methodId: MethodId
    readonly answer?: Form.Answer
    readonly label?: string
  }) {
    const method = deps.oauthMethod(input.integrationId, input.methodId)
    if (!method) {
      return yield* Effect.die(new Error(`OAuth method not found: ${input.integrationId}/${input.methodId}`))
    }
    const answer = input.answer ?? {}
    const invalid = deps.answerError(method.method.form, answer)
    if (invalid) return yield* Effect.fail(authorizationError(new Error(invalid)))
    const attemptScope = yield* Scope.fork(scope)
    const authorization = yield* authorize(method.authorize(answer)).pipe(
      Scope.provide(attemptScope),
      Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(attemptScope, exit) : Effect.void)),
    )
    const id = IntegrationSchema.AttemptId.create(deps.ids)
    const created = yield* Clock.currentTimeMillis
    const time = {created, expires: authorization.expiresAt ?? created + attemptLifetime}
    yield* SynchronizedRef.update(attempts, (current) =>
      new Map(current).set(id, {
        status: 'pending',
        completing: authorization.mode === 'auto',
        persisting: false,
        authorization,
        integrationId: input.integrationId,
        methodId: input.methodId,
        label: input.label,
        scope: attemptScope,
        time,
      }),
    )
    if (authorization.mode === 'auto') {
      yield* authorization.callback.pipe(
        Effect.exit,
        Effect.flatMap((exit) => settle(id, exit)),
        Effect.forkIn(attemptScope, {startImmediately: true}),
      )
    }
    return IntegrationSchema.Attempt.make({
      attemptId: id,
      url: authorization.url,
      instructions: authorization.instructions,
      mode: authorization.mode,
      ...(authorization.mode === 'auto' && authorization.submit ? {paste: true as const} : {}),
      time,
    })
  })

  const connectCommand = Effect.fn('Integration.command.connect')(function* (input: {
    readonly integrationId: Id
    readonly methodId: MethodId
    readonly label?: string
  }) {
    const method = deps.commandMethod(input.integrationId, input.methodId)
    const program = method?.command[0]
    if (!method || program === undefined) {
      return yield* Effect.die(new Error(`Command method not found: ${input.integrationId}/${input.methodId}`))
    }

    const attemptScope = yield* Scope.fork(scope)
    const attemptId = IntegrationSchema.AttemptId.create(deps.ids)
    const created = yield* Clock.currentTimeMillis
    const time = {created, expires: created + attemptLifetime}
    yield* SynchronizedRef.update(commandAttempts, (current) =>
      new Map(current).set(attemptId, {
        status: 'pending',
        integrationId: input.integrationId,
        label: input.label,
        persisting: false,
        scope: attemptScope,
        time,
      }),
    )

    yield* Effect.gen(function* () {
      const handle = yield* deps.spawner.spawn(
        ChildProcess.make(program, method.command.slice(1), {
          extendEnv: true,
          stdin: 'ignore',
        }),
      )
      const stdout = yield* handle.stdout.pipe(Stream.decodeText, Stream.mkString, Effect.forkScoped)
      yield* handle.stderr.pipe(
        Stream.decodeText,
        Stream.tap((chunk) =>
          SynchronizedRef.update(commandAttempts, (current) => {
            const attempt = current.get(attemptId)
            if (!attempt || attempt.status !== 'pending') return current
            const text = (attempt.message ?? '') + chunk
            return new Map(current).set(attemptId, {...attempt, message: text})
          }),
        ),
        Stream.runDrain,
      )
      const exitCode = yield* handle.exitCode
      if (exitCode !== 0) {
        const attempt = (yield* SynchronizedRef.get(commandAttempts)).get(attemptId)
        return yield* Effect.fail(new Error(attempt?.message?.trim() || `Authentication command exited ${exitCode}`))
      }
      const credential = Redacted.make((yield* Fiber.join(stdout)).trim())
      if (!Redacted.value(credential))
        return yield* Effect.fail(new Error('Authentication command returned no credential'))
      return credential
    }).pipe(
      Scope.provide(attemptScope),
      Effect.exit,
      Effect.flatMap((exit) => settleCommand(attemptId, exit)),
      Effect.forkIn(attemptScope, {startImmediately: true}),
    )

    return IntegrationSchema.CommandAttempt.make({attemptId, time})
  })

  const oauth = {
    connect: connectOAuth,
    status: Effect.fn('Integration.oauth.status')(function* (input: AttemptInput) {
      const attempt = (yield* SynchronizedRef.get(attempts)).get(input.attemptId)
      if (!attempt || attempt.integrationId !== input.integrationId)
        return yield* Effect.fail(integrationErrors.ATTEMPT_NOT_FOUND(input))
      if (attempt.status === 'failed') {
        return {
          status: attempt.status,
          message: attempt.message ?? 'Authorization failed',
          time: attempt.time,
        } satisfies IntegrationSchema.AttemptStatus
      }
      return {status: attempt.status, time: attempt.time} satisfies IntegrationSchema.AttemptStatus
    }),
    complete: Effect.fn('Integration.oauth.complete')(function* (input: AttemptInput & {readonly code?: string}) {
      const attempt = yield* SynchronizedRef.modify(attempts, (current) => {
        const match = current.get(input.attemptId)
        if (!match || match.integrationId !== input.integrationId) return [undefined, current]
        if (match.status !== 'pending' || match.completing) return [match, current]
        if (match.authorization.mode === 'code' && input.code === undefined) return [match, current]
        return [match, new Map(current).set(input.attemptId, {...match, completing: true})]
      })
      if (!attempt)
        return yield* Effect.fail(
          integrationErrors.ATTEMPT_NOT_FOUND({integrationId: input.integrationId, attemptId: input.attemptId}),
        )
      if (attempt.status !== 'pending') return
      const authorization = attempt.authorization
      if (authorization.mode === 'auto' && authorization.submit && input.code !== undefined)
        return yield* authorize(authorization.submit(input.code))
      if (authorization.mode === 'code' && input.code === undefined) {
        return yield* Effect.fail(integrationErrors.CODE_REQUIRED({attemptId: input.attemptId}))
      }
      if (attempt.completing)
        return yield* Effect.die(new Error(`OAuth attempt already completing: ${input.attemptId}`))
      const callback = authorization.mode === 'auto' ? authorization.callback : authorization.callback(input.code ?? '')
      const exit = yield* authorize(callback).pipe(Effect.exit)
      yield* settle(input.attemptId, exit)
      if (Exit.isFailure(exit)) return yield* exit
    }),
    cancel: Effect.fn('Integration.oauth.cancel')((input: AttemptInput) =>
      cancel(
        attempts,
        input,
        Effect.logInfo('integration oauth attempt closed', {
          integrationId: input.integrationId,
          attemptId: input.attemptId,
          reason: 'cancelled',
        }),
      ),
    ),
  }

  const command = {
    connect: connectCommand,
    status: Effect.fn('Integration.command.status')(function* (input: AttemptInput) {
      const attempt = (yield* SynchronizedRef.get(commandAttempts)).get(input.attemptId)
      if (!attempt || attempt.integrationId !== input.integrationId)
        return yield* Effect.fail(integrationErrors.ATTEMPT_NOT_FOUND(input))
      if (attempt.status === 'pending') {
        return {
          status: attempt.status,
          ...(attempt.message ? {message: attempt.message} : {}),
          time: attempt.time,
        } satisfies IntegrationSchema.CommandAttemptStatus
      }
      if (attempt.status === 'failed') {
        return {
          status: attempt.status,
          message: attempt.message ?? 'Authentication failed',
          time: attempt.time,
        } satisfies IntegrationSchema.CommandAttemptStatus
      }
      return {status: attempt.status, time: attempt.time} satisfies IntegrationSchema.CommandAttemptStatus
    }),
    cancel: Effect.fn('Integration.command.cancel')((input: AttemptInput) => cancel(commandAttempts, input)),
  }

  return {oauth, command}
})
