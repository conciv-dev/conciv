import {createHash} from 'node:crypto'
import {Cause, Deferred, Effect, Exit, PubSub, Queue, Ref, Scope, Semaphore, Stream} from 'effect'
import {z} from 'zod'
import type {EvlogError} from 'evlog'
import {define as definePlugin, type Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import {Tool} from '@conciv/backend-app-api'
import {isClosed, type Connection} from '../control-server.js'
import {
  exposedToolName,
  simulationErrors,
  type ToolFailParams,
  type ToolFinishParams,
  type ToolInvocation,
  type ToolNotification,
  type ToolOutput,
  type ToolRegistration,
  type ToolUpdateParams,
} from '@conciv/protocol/simulation'

const COMPLETED_RETENTION = 256

export type ToolInvocationNotFound = {readonly kind: 'ToolInvocationNotFound'; readonly id: string}

export type ToolControllerRefused = {readonly kind: 'ToolController'; readonly message: string}

export type ToolFailure = ToolInvocationNotFound | ToolControllerRefused

type Controller = {readonly connection: Connection; readonly notifications: Queue.Queue<ToolNotification>}

type ToolCompletion =
  | {readonly type: 'success'; readonly output: ToolOutput}
  | {readonly type: 'failure'; readonly message: string}

type PendingToolInvocation = {
  readonly id: string
  readonly notification: ToolInvocation
  readonly progress: Tool.Context['progress']
  readonly completion: Deferred.Deferred<ToolCompletion>
  readonly operations: Semaphore.Semaphore
  update?: {readonly sequence: number; readonly fingerprint: string}
}

type Reconciliation = {readonly generation: number; readonly result: Deferred.Deferred<Exit.Exit<void, unknown>>}

type RegistrationUpdate = {readonly generation: number; readonly registrations: readonly ToolRegistration[]}

type ToolState = {
  readonly counter: number
  readonly generation: number
  readonly appliedGeneration: number
  readonly controller?: Controller
  readonly registrations: readonly ToolRegistration[]
  readonly pending: ReadonlyMap<string, PendingToolInvocation>
  readonly completed: ReadonlyMap<string, string>
  readonly activeOverlays: ReadonlySet<object>
  readonly reconciliation: ReadonlyMap<object, Reconciliation>
}

export type Interface = {
  readonly install: (
    connection: Connection,
    registrations: readonly ToolRegistration[],
  ) => Effect.Effect<Queue.Dequeue<ToolNotification>, ToolFailure>
  readonly update: (connection: Connection, params: ToolUpdateParams) => Effect.Effect<void, ToolFailure>
  readonly finish: (connection: Connection, params: ToolFinishParams) => Effect.Effect<void, ToolFailure>
  readonly fail: (connection: Connection, params: ToolFailParams) => Effect.Effect<void, ToolFailure>
  readonly release: (connection: Connection, notifications?: Queue.Dequeue<ToolNotification>) => Effect.Effect<void>
  readonly shutdown: Effect.Effect<void>
  readonly plugin: Plugin
}

export function refusal(failure: ToolFailure): EvlogError {
  if (failure.kind === 'ToolInvocationNotFound') return simulationErrors.TOOL_INVOCATION_NOT_FOUND({id: failure.id})
  return simulationErrors.TOOL_CONTROLLER({message: failure.message})
}

function notFound(id: string): ToolInvocationNotFound {
  return {kind: 'ToolInvocationNotFound', id}
}

function refused(message: string): ToolControllerRefused {
  return {kind: 'ToolController', message}
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? String(value)
}

function fingerprintJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('base64url')
}

function withoutPending(current: ToolState, id: string): ToolState {
  const pending = new Map(current.pending)
  pending.delete(id)
  return {...current, pending}
}

function completed(current: ToolState, id: string, fingerprint: string): ToolState {
  const done = new Map(current.completed).set(id, fingerprint)
  if (done.size > COMPLETED_RETENTION) {
    const oldest = done.keys().next().value
    if (oldest !== undefined) done.delete(oldest)
  }
  return {...withoutPending(current, id), completed: done}
}

function withoutController(current: ToolState): ToolState {
  const {controller: _controller, ...rest} = current
  return rest
}

function toolResult(output: ToolOutput): Tool.Result {
  if (output.content.length === 0) return {output: output.structured}
  return {
    output: output.structured,
    content: output.content.map((part): Tool.Content => {
      if (part.type === 'text') return part
      const file = {type: 'file' as const, uri: `data:${part.mime};base64,${part.data}`, mime: part.mime}
      return part.name === undefined ? file : {...file, name: part.name}
    }),
  }
}

function toolOptions(registration: ToolRegistration): Tool.Options | undefined {
  const options = registration.options
  const namespace = options?.namespace === undefined ? {} : {namespace: options.namespace}
  const permission = registration.permission === undefined ? {} : {permission: registration.permission}
  if (options?.codemode === undefined) {
    return options === undefined && registration.permission === undefined ? undefined : {...namespace, ...permission}
  }
  return {...namespace, ...permission, codemode: options.codemode}
}

const JsonSchema = z.json()

export const make = Effect.gen(function* () {
  const state = yield* Ref.make<ToolState>({
    counter: 0,
    generation: 0,
    appliedGeneration: 0,
    registrations: [],
    pending: new Map(),
    completed: new Map(),
    activeOverlays: new Set(),
    reconciliation: new Map(),
  })
  const registrationUpdates = yield* PubSub.unbounded<RegistrationUpdate>()
  const lock = yield* Semaphore.make(1)
  const attachmentLock = yield* Semaphore.make(1)

  const notify = (controller: Controller, notification: ToolNotification) =>
    isClosed(controller.connection)
      ? Effect.void
      : Queue.offer(controller.notifications, notification).pipe(Effect.asVoid)

  const requireController = (connection: Connection) =>
    Ref.get(state).pipe(
      Effect.flatMap((current) =>
        current.controller?.connection === connection
          ? Effect.succeed(current)
          : Effect.fail(refused('Drive tool controller is not attached')),
      ),
    )

  const requireInvocation = (connection: Connection, id: string) =>
    requireController(connection).pipe(
      Effect.flatMap((current) => {
        const invocation = current.pending.get(id)
        return invocation === undefined ? Effect.fail(notFound(id)) : Effect.succeed(invocation)
      }),
    )

  const cancel = (id: string) =>
    Effect.gen(function* () {
      const invocation = yield* lock.withPermit(Ref.get(state).pipe(Effect.map((current) => current.pending.get(id))))
      if (invocation === undefined) return
      yield* invocation.operations.withPermit(
        lock.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state)
            if (current.pending.get(id) !== invocation) return
            yield* Ref.set(state, withoutPending(current, id))
            if (current.controller !== undefined) {
              yield* notify(current.controller, {method: 'tool.cancel', params: {id, reason: 'interrupted'}})
            }
          }),
        ),
      )
    })

  const open = (generation: number, name: string, input: z.infer<typeof JsonSchema>, context: Tool.Context) =>
    attachmentLock.withPermit(
      lock.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state)
          if (current.generation !== generation) {
            return yield* Effect.fail(
              Tool.makeError({message: `Simulated tool registration is no longer active: ${name}`}),
            )
          }
          const id = `tool_${current.counter + 1}`
          const notification: ToolInvocation = {
            id,
            name,
            input,
            context: {
              sessionId: context.sessionId,
              agent: context.agent,
              ...(context.messageId === undefined ? {} : {messageId: context.messageId}),
              id: context.id,
            },
          }
          const pending: PendingToolInvocation = {
            id,
            notification,
            progress: context.progress,
            completion: yield* Deferred.make<ToolCompletion>(),
            operations: Semaphore.makeUnsafe(1),
          }
          yield* Ref.set(state, {
            ...current,
            counter: current.counter + 1,
            pending: new Map(current.pending).set(id, pending),
          })
          if (current.controller !== undefined) {
            yield* notify(current.controller, {method: 'tool.invocation', params: notification})
          }
          return pending
        }),
      ),
    )

  const invoke = (generation: number, name: string, input: unknown, context: Tool.Context) =>
    Effect.gen(function* () {
      const json = JsonSchema.safeParse(input)
      if (!json.success) {
        return yield* Effect.fail(Tool.makeError({message: `Simulated tool input is not JSON: ${json.error.message}`}))
      }
      const completion = yield* Effect.uninterruptibleMask((restore) =>
        open(generation, name, json.data, context).pipe(
          Effect.flatMap((pending) =>
            restore(Deferred.await(pending.completion)).pipe(
              Effect.onInterrupt(() => cancel(pending.id)),
              Effect.ensuring(
                lock.withPermit(
                  Ref.update(state, (current) =>
                    current.pending.get(pending.id) === pending ? withoutPending(current, pending.id) : current,
                  ),
                ),
              ),
            ),
          ),
        ),
      )
      if (completion.type === 'success') return toolResult(completion.output)
      return yield* Effect.fail(Tool.makeError({message: completion.message}))
    })

  const plugin = definePlugin({
    id: 'conciv.simulation.tools',
    effect: (ctx) =>
      Effect.gen(function* () {
        const scope = yield* Scope.Scope
        const token = {}
        const registrationLock = Semaphore.makeUnsafe(1)
        const overlay: {scope: Scope.Closeable | undefined} = {scope: undefined}
        const reconcile = (generation: number, registrations: readonly ToolRegistration[]) =>
          registrationLock.withPermit(
            Effect.gen(function* () {
              const next = yield* Scope.fork(scope)
              const applied = yield* Effect.exit(
                ctx.tool
                  .transform((draft) => {
                    for (const registration of registrations) {
                      const options = toolOptions(registration)
                      draft.add({
                        name: registration.name,
                        ...(options === undefined ? {} : {options}),
                        description: registration.description,
                        input: registration.inputSchema,
                        output: registration.outputSchema ?? {},
                        execute: (input, context) => invoke(generation, exposedToolName(registration), input, context),
                      })
                    }
                  })
                  .pipe(Scope.provide(next)),
              )
              if (Exit.isFailure(applied)) {
                yield* Scope.close(next, applied)
                return yield* Effect.failCause(applied.cause)
              }
              const previous = overlay.scope
              overlay.scope = next
              if (previous !== undefined) yield* Scope.close(previous, Exit.void)
            }),
          )

        const acknowledge = (generation: number, result: Exit.Exit<void, unknown>) =>
          lock.withPermit(
            Effect.gen(function* () {
              const current = yield* Ref.get(state)
              const reconciliation = current.reconciliation.get(token)
              if (reconciliation?.generation !== generation) return
              yield* Deferred.succeed(reconciliation.result, result)
            }),
          )

        const initialized = yield* lock.withPermit(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(registrationUpdates)
            const current = yield* Ref.get(state)
            yield* Ref.set(state, {...current, activeOverlays: new Set(current.activeOverlays).add(token)})
            return {subscription, generation: current.generation, registrations: current.registrations}
          }),
        )
        yield* Effect.addFinalizer(() =>
          lock.withPermit(
            Effect.gen(function* () {
              const current = yield* Ref.get(state)
              const activeOverlays = new Set(current.activeOverlays)
              activeOverlays.delete(token)
              const reconciliation = new Map(current.reconciliation)
              const pending = reconciliation.get(token)
              reconciliation.delete(token)
              yield* Ref.set(state, {...current, activeOverlays, reconciliation})
              if (pending !== undefined) yield* Deferred.succeed(pending.result, Exit.void)
            }),
          ),
        )
        yield* reconcile(initialized.generation, initialized.registrations)
        yield* Stream.fromEffectRepeat(PubSub.take(initialized.subscription)).pipe(
          Stream.runForEach((update) =>
            Effect.exit(reconcile(update.generation, update.registrations)).pipe(
              Effect.flatMap((result) => acknowledge(update.generation, result)),
            ),
          ),
          Effect.forkScoped({startImmediately: true}),
        )
      }),
  })

  const reconcileRegistrations = (
    controller: Controller | undefined,
    registrations: readonly ToolRegistration[],
    targetGeneration?: number,
  ) =>
    Effect.gen(function* () {
      const started = yield* lock.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state)
          const generation = targetGeneration ?? current.generation + 1
          const reconciliation = new Map<object, Reconciliation>()
          for (const token of current.activeOverlays) {
            reconciliation.set(token, {generation, result: Deferred.makeUnsafe<Exit.Exit<void, unknown>>()})
          }
          const base = withoutController(current)
          yield* Ref.set(state, {
            ...base,
            ...(controller === undefined ? {} : {controller}),
            generation,
            registrations,
            reconciliation,
          })
          yield* PubSub.publish(registrationUpdates, {generation, registrations})
          return {generation, previous: current, reconciliation}
        }),
      )
      const results = yield* Effect.forEach(started.reconciliation.values(), (item) => Deferred.await(item.result))
      const failure = results.find(Exit.isFailure)
      yield* lock.withPermit(
        Ref.update(state, (current) =>
          current.generation === started.generation
            ? {
                ...current,
                ...(failure === undefined ? {appliedGeneration: started.generation} : {}),
                reconciliation: new Map(),
              }
            : current,
        ),
      )
      return {failure, previous: started.previous}
    })

  const replay = (controller: Controller) =>
    lock.withPermit(
      Effect.gen(function* () {
        const current = yield* Ref.get(state)
        if (current.controller !== controller) return
        yield* Effect.forEach(
          current.pending.values(),
          (invocation) => notify(controller, {method: 'tool.invocation', params: invocation.notification}),
          {discard: true},
        )
      }),
    )

  const endPrevious = (previous: Controller | undefined, next: Controller) =>
    previous !== undefined && previous !== next && previous.connection === next.connection
      ? Queue.shutdown(previous.notifications)
      : Effect.void

  const applyRegistrations = (controller: Controller, registrations: readonly ToolRegistration[]) =>
    Effect.gen(function* () {
      const reconciled = yield* reconcileRegistrations(controller, registrations)
      if (reconciled.failure === undefined) return
      const rolledBack = yield* reconcileRegistrations(
        reconciled.previous.controller,
        reconciled.previous.registrations,
        reconciled.previous.generation,
      )
      const applied = Cause.pretty(reconciled.failure.cause)
      return yield* Effect.fail(
        refused(
          rolledBack.failure === undefined
            ? `Failed to apply simulated tools: ${applied}`
            : `Failed to apply and restore simulated tools: ${applied}; ${Cause.pretty(rolledBack.failure.cause)}`,
        ),
      )
    })

  const installRefusal = (current: ToolState, connection: Connection, sameRegistrations: boolean) => {
    const owner = current.controller
    if (isClosed(connection)) return refused('Drive tool controller disconnected before attachment')
    if (owner !== undefined && owner.connection !== connection && !isClosed(owner.connection)) {
      return refused('Another Drive tool controller is already attached')
    }
    if (owner?.connection !== connection && current.pending.size > 0 && !sameRegistrations) {
      return refused('A reconnecting Drive tool controller must settle pending invocations before replacing tools')
    }
    return undefined
  }

  const abandon = (controller: Controller) =>
    lock
      .withPermit(
        Ref.update(state, (latest) => (latest.controller === controller ? withoutController(latest) : latest)),
      )
      .pipe(Effect.andThen(Queue.shutdown(controller.notifications)))

  const install: Interface['install'] = (connection, registrations) =>
    attachmentLock.withPermit(
      Effect.gen(function* () {
        const current = yield* Ref.get(state)
        const owner = current.controller
        const sameRegistrations =
          current.appliedGeneration === current.generation &&
          fingerprintJson(current.registrations) === fingerprintJson(registrations)
        const blocked = installRefusal(current, connection, sameRegistrations)
        if (blocked !== undefined) return yield* Effect.fail(blocked)
        const controller: Controller = {connection, notifications: yield* Queue.unbounded<ToolNotification>()}
        return yield* Effect.gen(function* () {
          if (sameRegistrations) yield* lock.withPermit(Ref.update(state, (latest) => ({...latest, controller})))
          else yield* applyRegistrations(controller, registrations)
          yield* endPrevious(owner, controller)
          if (owner?.connection !== connection) yield* replay(controller)
          return controller.notifications
        }).pipe(Effect.onInterrupt(() => abandon(controller)))
      }),
    )

  const update: Interface['update'] = (connection, params) =>
    Effect.gen(function* () {
      const invocation = yield* lock.withPermit(requireInvocation(connection, params.id))
      yield* invocation.operations.withPermit(
        Effect.gen(function* () {
          const current = yield* lock.withPermit(Ref.get(state))
          if (current.pending.get(params.id) !== invocation) return yield* Effect.fail(notFound(params.id))
          const fingerprint = fingerprintJson(params.update)
          const applied = invocation.update
          if (applied?.sequence === params.sequence && applied.fingerprint === fingerprint) return
          if (applied?.sequence === params.sequence) {
            return yield* Effect.fail(
              refused(`Simulated tool update sequence ${params.sequence} was reused with different progress`),
            )
          }
          const expected = applied === undefined ? 0 : applied.sequence + 1
          if (params.sequence !== expected) {
            return yield* Effect.fail(
              refused(`Expected simulated tool update sequence ${expected}, received ${params.sequence}`),
            )
          }
          yield* invocation.progress(params.update)
          invocation.update = {sequence: params.sequence, fingerprint}
        }),
      )
    })

  const settle = (connection: Connection, id: string, completion: ToolCompletion) =>
    Effect.gen(function* () {
      const current = yield* lock.withPermit(requireController(connection))
      const fingerprint = fingerprintJson(completion)
      const invocation = current.pending.get(id)
      if (invocation === undefined) {
        if (current.completed.get(id) === fingerprint) return
        return yield* Effect.fail(notFound(id))
      }
      yield* invocation.operations.withPermit(
        Effect.uninterruptible(
          lock.withPermit(
            Effect.gen(function* () {
              const latest = yield* Ref.get(state)
              if (latest.pending.get(id) !== invocation) {
                if (latest.completed.get(id) === fingerprint) return
                return yield* Effect.fail(notFound(id))
              }
              yield* Ref.set(state, completed(latest, id, fingerprint))
              yield* Deferred.succeed(invocation.completion, completion)
            }),
          ),
        ),
      )
    })

  const release: Interface['release'] = (connection, notifications) =>
    attachmentLock.withPermit(
      lock.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state)
          const controller = current.controller
          if (controller?.connection !== connection) return
          if (notifications !== undefined && controller.notifications !== notifications) return
          yield* Ref.set(state, withoutController(current))
          yield* Queue.shutdown(controller.notifications)
        }),
      ),
    )

  const shutdown = attachmentLock.withPermit(
    Effect.gen(function* () {
      yield* reconcileRegistrations(undefined, [])
      const current = yield* lock.withPermit(
        Effect.gen(function* () {
          const latest = yield* Ref.get(state)
          yield* Ref.set(state, {
            ...withoutController(latest),
            registrations: [],
            pending: new Map(),
            activeOverlays: new Set<object>(),
            reconciliation: new Map(),
          })
          return latest
        }),
      )
      yield* Effect.forEach(
        current.pending.values(),
        (invocation) =>
          Deferred.succeed(invocation.completion, {type: 'failure', message: 'Simulated tool controller shut down'}),
        {discard: true},
      )
      if (current.controller !== undefined) yield* Queue.shutdown(current.controller.notifications)
      yield* PubSub.shutdown(registrationUpdates)
    }),
  )

  return {
    install,
    update,
    finish: (connection, params) => settle(connection, params.id, {type: 'success', output: params.output}),
    fail: (connection, params) => settle(connection, params.id, {type: 'failure', message: params.message}),
    release,
    shutdown,
    plugin,
  } satisfies Interface
})
