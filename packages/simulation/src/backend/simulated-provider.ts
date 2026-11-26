import {implement} from '@orpc/server'
import {Cause, Effect, Fiber, FiberSet, PubSub, Queue, Ref, Semaphore, Stream, type Scope} from 'effect'
import type {Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import {type Connection} from '../control-server.js'
import * as SimulationControlServer from '../control-server.js'
import {
  BACKEND_CAPABILITIES,
  backendContract,
  type FinishReason,
  type Item,
  type LlmNotification,
  type ModelRequest,
  type ProviderInvocation,
} from '@conciv/protocol/simulation'
import * as SimulatedTools from './simulated-tools.js'

const RESPONSE_LIMIT = 256

export type ProviderResponseEvent = Item | {readonly type: 'finish'; readonly reason: FinishReason}

export type ProviderDisconnected = {readonly _tag: 'SimulatedProvider.ProviderDisconnected'; readonly message: string}

export type Interface = {
  readonly stream: (request: ModelRequest) => Stream.Stream<ProviderResponseEvent, ProviderDisconnected>
}

type InvocationNotFound = {readonly kind: 'InvocationNotFound'; readonly id: string; readonly message: string}

type ControllerDisconnected = {readonly kind: 'ControllerDisconnected'; readonly message: string}

type PendingInvocation = ProviderInvocation & {
  readonly responses: Queue.Queue<ProviderResponseEvent, ProviderDisconnected | Cause.Done>
}

type State = {readonly counter: number; readonly pending: ReadonlyMap<string, PendingInvocation>}

type Attachment = {readonly fiber: Fiber.Fiber<void>; readonly notifications: Queue.Queue<LlmNotification>}

function invocationNotFound(id: string): InvocationNotFound {
  return {kind: 'InvocationNotFound', id, message: `Simulated provider invocation not found or already finished: ${id}`}
}

function controllerDisconnected(message: string): ControllerDisconnected {
  return {kind: 'ControllerDisconnected', message}
}

function withoutInvocation(current: State, id: string): State {
  const pending = new Map(current.pending)
  pending.delete(id)
  return {...current, pending}
}

function published(invocation: PendingInvocation): ProviderInvocation {
  return {id: invocation.id, request: invocation.request}
}

const makeDriver = Effect.gen(function* () {
  const state = yield* Ref.make<State>({counter: 0, pending: new Map()})
  const opened = yield* PubSub.unbounded<ProviderInvocation>()
  const lock = yield* Semaphore.make(1)

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      const current = yield* Ref.get(state)
      yield* Effect.forEach(current.pending.values(), (invocation) => Queue.shutdown(invocation.responses), {
        discard: true,
      })
      yield* PubSub.shutdown(opened)
    }),
  )

  const open = (request: ModelRequest) =>
    lock.withPermit(
      Effect.gen(function* () {
        const current = yield* Ref.get(state)
        const id = `inv_${current.counter + 1}`
        const responses = yield* Queue.bounded<ProviderResponseEvent, ProviderDisconnected | Cause.Done>(RESPONSE_LIMIT)
        const invocation: PendingInvocation = {id, request, responses}
        yield* Ref.set(state, {counter: current.counter + 1, pending: new Map(current.pending).set(id, invocation)})
        yield* PubSub.publish(opened, published(invocation))
        return invocation
      }),
    )

  const close = (invocation: PendingInvocation) =>
    Effect.gen(function* () {
      yield* Queue.shutdown(invocation.responses)
      yield* lock.withPermit(
        Ref.update(state, (current) =>
          current.pending.get(invocation.id) === invocation ? withoutInvocation(current, invocation.id) : current,
        ),
      )
    })

  const requireInvocation = (id: string) =>
    Ref.get(state).pipe(
      Effect.flatMap((current) => {
        const invocation = current.pending.get(id)
        return invocation === undefined ? Effect.fail(invocationNotFound(id)) : Effect.succeed(invocation)
      }),
    )

  const takeInvocation = (id: string) =>
    lock.withPermit(
      Effect.gen(function* () {
        const invocation = yield* requireInvocation(id)
        yield* Ref.update(state, (current) => withoutInvocation(current, id))
        return invocation
      }),
    )

  const pending = lock.withPermit(
    Ref.get(state).pipe(Effect.map((current) => Array.from(current.pending.values(), published))),
  )

  return {
    stream: (request: ModelRequest): Stream.Stream<ProviderResponseEvent, ProviderDisconnected> =>
      Stream.unwrap(
        Effect.acquireRelease(open(request), close).pipe(
          Effect.map((invocation) =>
            Stream.fromQueue(invocation.responses).pipe(Stream.takeUntil((event) => event.type === 'finish')),
          ),
        ),
      ),
    requests: Stream.unwrap(
      lock.withPermit(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(opened)
          const current = yield* Ref.get(state)
          return Stream.concat(
            Stream.fromIterable(Array.from(current.pending.values(), published)),
            Stream.fromEffectRepeat(PubSub.take(subscription)),
          )
        }),
      ),
    ),
    push: (id: string, items: readonly Item[]) =>
      lock.withPermit(requireInvocation(id)).pipe(
        Effect.flatMap((invocation) => Queue.offerAll(invocation.responses, items)),
        Effect.asVoid,
      ),
    finish: (id: string, reason: FinishReason) =>
      takeInvocation(id).pipe(
        Effect.tap((invocation) => Queue.offer(invocation.responses, {type: 'finish', reason})),
        Effect.flatMap((invocation) => Queue.end(invocation.responses)),
        Effect.asVoid,
      ),
    disconnect: (id: string) =>
      takeInvocation(id).pipe(
        Effect.flatMap((invocation) =>
          Queue.fail(invocation.responses, {
            _tag: 'SimulatedProvider.ProviderDisconnected',
            message: 'Simulated model provider disconnected',
          }),
        ),
        Effect.asVoid,
      ),
    pending,
  }
})

type Driver = Effect.Success<typeof makeDriver>

const makeControllers = (driver: Driver) =>
  Effect.gen(function* () {
    const fibers = yield* FiberSet.make<void, unknown>()
    const active = yield* Ref.make<Attachment | undefined>(undefined)
    const controllerLock = yield* Semaphore.make(1)
    const attachments = new WeakMap<Connection, Attachment>()

    const stop = (attachment: Attachment) =>
      Fiber.interrupt(attachment.fiber).pipe(Effect.andThen(Queue.shutdown(attachment.notifications)))

    const take = (connection: Connection) =>
      controllerLock.withPermit(
        Effect.gen(function* () {
          if (SimulationControlServer.isClosed(connection)) {
            return yield* Effect.fail(controllerDisconnected('Drive controller disconnected before attachment'))
          }
          const previous = yield* Ref.get(active)
          if (previous !== undefined) yield* stop(previous)
          const notifications = yield* Queue.unbounded<LlmNotification>()
          const fiber = yield* FiberSet.run(
            fibers,
            driver.requests.pipe(
              Stream.runForEach((invocation) =>
                Queue.offer(notifications, {method: 'llm.request', params: invocation}),
              ),
            ),
          )
          const attachment: Attachment = {fiber, notifications}
          if (SimulationControlServer.isClosed(connection)) {
            yield* stop(attachment)
            return yield* Effect.fail(controllerDisconnected('Drive controller disconnected during attachment'))
          }
          attachments.set(connection, attachment)
          yield* Ref.set(active, attachment)
          return attachment
        }),
      )

    const release = (connection: Connection, attachment?: Attachment) =>
      controllerLock.withPermit(
        Effect.gen(function* () {
          const current = attachments.get(connection)
          if (current === undefined || (attachment !== undefined && attachment !== current)) return
          attachments.delete(connection)
          yield* stop(current)
          yield* Ref.update(active, (value) => (value === current ? undefined : value))
        }),
      )

    return {take, release}
  })

function run<A, E>(effect: Effect.Effect<A, E>, refuse: (failure: E) => Error): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.mapError(refuse)))
}

const makeRouter = (
  driver: Driver,
  controllers: Effect.Success<ReturnType<typeof makeControllers>>,
  tools: SimulatedTools.Interface,
  version: string,
) => {
  const os = implement(backendContract).$context<SimulationControlServer.Context>()
  return os.router({
    handshake: os.handshake.handler(({input, errors}) => {
      const outcome = SimulationControlServer.dispatchHandshake(
        {role: 'backend', server: {name: 'conciv', version}, capabilities: BACKEND_CAPABILITIES},
        input,
      )
      if (outcome.type === 'accepted') return outcome.response
      const refused = outcome.refusal
      if (refused.code === 'ROLE_MISMATCH') throw errors.ROLE_MISMATCH(refused)
      if (refused.code === 'UNSUPPORTED_PROTOCOL') throw errors.UNSUPPORTED_PROTOCOL(refused)
      throw errors.MISSING_CAPABILITY(refused)
    }),
    llm: {
      subscribe: os.llm.subscribe.handler(async ({context, errors}) => {
        const attachment = await run(controllers.take(context.connection), (failure) =>
          errors.CONTROLLER_DISCONNECTED({message: failure.message}),
        )
        return SimulationControlServer.notifications(attachment.notifications, context.connection, () =>
          Effect.runPromise(controllers.release(context.connection, attachment)),
        )
      }),
      pending: os.llm.pending.handler(async () => ({invocations: await Effect.runPromise(driver.pending)})),
      chunk: os.llm.chunk.handler(async ({input, errors}) => {
        await run(driver.push(input.id, input.items), (failure) =>
          errors.INVOCATION_NOT_FOUND({message: failure.message, data: {id: input.id}}),
        )
        return {ok: true}
      }),
      finish: os.llm.finish.handler(async ({input, errors}) => {
        await run(driver.finish(input.id, input.reason), (failure) =>
          errors.INVOCATION_NOT_FOUND({message: failure.message, data: {id: input.id}}),
        )
        return {ok: true}
      }),
      disconnect: os.llm.disconnect.handler(async ({input, errors}) => {
        await run(driver.disconnect(input.id), (failure) =>
          errors.INVOCATION_NOT_FOUND({message: failure.message, data: {id: input.id}}),
        )
        return {ok: true}
      }),
    },
    tool: {
      register: os.tool.register.handler(async ({input, context, errors}) => {
        const notifications = await run(tools.install(context.connection, input.tools), (failure) =>
          SimulatedTools.refusal(failure, errors),
        )
        return SimulationControlServer.notifications(notifications, context.connection, () =>
          Effect.runPromise(tools.release(context.connection, notifications)),
        )
      }),
      update: os.tool.update.handler(async ({input, context, errors}) => {
        await run(tools.update(context.connection, input), (failure) => SimulatedTools.refusal(failure, errors))
        return {ok: true}
      }),
      finish: os.tool.finish.handler(async ({input, context, errors}) => {
        await run(tools.finish(context.connection, input), (failure) => SimulatedTools.refusal(failure, errors))
        return {ok: true}
      }),
      fail: os.tool.fail.handler(async ({input, context, errors}) => {
        await run(tools.fail(context.connection, input), (failure) => SimulatedTools.refusal(failure, errors))
        return {ok: true}
      }),
    },
  })
}

export type DriveOptions = {readonly endpoint: string; readonly version: string}

export type Drive = {readonly provider: Interface; readonly plugin: Plugin}

export const drive = (options: DriveOptions): Effect.Effect<Drive, Error, Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* makeDriver
    const controllers = yield* makeControllers(driver)
    const tools = yield* SimulatedTools.make
    yield* Effect.addFinalizer(() => tools.shutdown)
    const server = yield* SimulationControlServer.start({
      endpoint: new URL(options.endpoint),
      label: 'conciv drive backend websocket',
      router: makeRouter(driver, controllers, tools, options.version),
      close: (connection) => Effect.all([controllers.release(connection), tools.release(connection)], {discard: true}),
    })
    yield* Effect.sync(() => process.stderr.write(`conciv drive backend websocket: ${server.url}\n`))
    return {provider: {stream: driver.stream}, plugin: tools.plugin}
  })
