import {Cause, Deferred, Duration, Effect, Exit, Fiber, FiberMap, Schedule, Semaphore} from 'effect'
import {z} from 'zod'
import type {MountedSession} from '@conciv/plugin/experimental'
import type {PageOperation} from '@conciv/plugin/experimental/page'
import {Command, Control, Definition, Outcome, Tab} from './rpc.js'
import type {PageOperations} from './operations.js'
import {redactedUrl} from './redacted-url.js'

export type AttachmentOutcome =
  | 'born'
  | 'closed'
  | 'missing'
  | 'refused'
  | 'replaced'
  | 'transient'
  | 'unavailable'
  | 'unsupported'

export type AttachmentEnd = {readonly outcome: AttachmentOutcome; readonly attached: boolean}

export type Attaching = {
  readonly session: MountedSession
  readonly connectionId: string
  readonly tab: () => Tab
  readonly changed: (report: () => void, signal: AbortSignal) => void
  readonly operations: PageOperations
  readonly registered: () => readonly PageOperation[]
  readonly notify: (title: string) => void
}

const CONTROL: `rpc.${typeof Definition.id}.control` = `rpc.${Definition.id}.control`

const STATE_RETRY = Schedule.max([Schedule.exponential(Duration.millis(250)), Schedule.recurs(6)])

const TRANSIENT_RETRY = Schedule.min([Schedule.exponential(Duration.seconds(1)), Schedule.spaced(Duration.seconds(30))])

const WAKE_EVENTS = ['focus', 'pointerdown', 'keydown']

const ControlHeader = z.object({type: z.string(), connectionId: z.string()})

const RpcFailure = z.object({type: z.string()})

const UNSUPPORTED: Outcome = {
  type: 'failure',
  code: 'unsupported',
  message:
    'This page does not support the requested page operation. Ask the user to reload the page so it runs the same conciv version as the engine, or use another operation.',
}

const PAGE_TOOLS_OFF: Partial<Record<AttachmentOutcome, string>> = {
  refused: 'Page tools couldn’t attach to this session. Reload the page or start a new session.',
  unsupported: 'Page tools are off. Reload the page so it runs the same conciv version as the engine.',
}

const PAGE_TOOLS_BROKEN = 'Page tools stopped working. Reload the page.'

function attachmentFailure(cause: unknown): AttachmentOutcome {
  const type = RpcFailure.safeParse(cause).data?.type

  if (type === 'missing' || type === 'transient') return type

  if (type === 'unavailable') return 'refused'

  if (type === 'rpc.unavailable') return 'unavailable'

  if (type === 'rpc.method_not_found' || type === 'rpc.invalid_input') return 'unsupported'

  return 'closed'
}

function retryable(cause: unknown) {
  const type = RpcFailure.safeParse(cause).data?.type

  return type !== 'unavailable' && type !== 'rpc.unavailable'
}

function failed(code: string, cause: unknown): Outcome {
  return {type: 'failure', code, message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 2048)}
}

function caught(cause: unknown) {
  return cause
}

function dispatchCommand(attaching: Pick<Attaching, 'operations' | 'registered'>) {
  return (command: Command, signal: AbortSignal): Promise<Outcome> => {
    const {action} = command
    if (action.type !== 'operation') return attaching.operations.execute({...command, action}, signal)
    const operation = attaching.registered().find((entry) => entry.name === action.name)
    if (!operation) return Promise.resolve(UNSUPPORTED)
    return operation.run(action.input, signal).then(
      (value): Outcome => {
        const json = z.json().safeParse(value)
        if (!json.success) return failed('handler-error', `${action.name} returned a value that is not JSON`)
        return {type: 'success', result: {value: json.data, files: []}}
      },
      (cause: unknown) => failed('handler-error', cause),
    )
  }
}

function woken() {
  return Effect.callback<void>((resume) => {
    const woke = new AbortController()
    const options = {once: true, signal: woke.signal}
    const wake = () => resume(Effect.void)
    WAKE_EVENTS.forEach((type) => window.addEventListener(type, wake, options))
    document.addEventListener('visibilitychange', wake, options)
    return Effect.sync(() => woke.abort())
  })
}

function connectOnce(input: Attaching): Effect.Effect<AttachmentEnd> {
  return Effect.scoped(
    Effect.gen(function* () {
      const client = input.session.server.client
      const rpc = client.rpc(Definition)
      const attachment = {sessionId: input.session.id, connectionId: input.connectionId}
      const execute = dispatchCommand(input)
      const ending = new AbortController()
      yield* Effect.addFinalizer(() => Effect.sync(() => ending.abort()))
      const ended = ending.signal
      const outbound = yield* Semaphore.make(1)
      const attached = yield* Deferred.make<void>()
      const connected = yield* Deferred.make<void>()
      const calls = yield* FiberMap.make<string>()
      const run = yield* FiberMap.runtime(calls)()

      const send = (message: Effect.Effect<unknown, unknown>) =>
        outbound.withPermit(message).pipe(
          Effect.tapError((cause) =>
            Effect.sync(() => ended.aborted || console.warn('[conciv] page send failed', cause)),
          ),
          Effect.exit,
          Effect.map(Exit.isSuccess),
        )

      const reply = (requestId: string, outcome: Outcome) =>
        send(
          Effect.tryPromise({
            try: () => rpc.result({...attachment, requestId, outcome: z.encode(Outcome, outcome)}),
            catch: caught,
          }),
        )

      const sendState = (state: Tab) =>
        send(
          Effect.tryPromise({try: (signal) => rpc.state({...attachment, state}, {signal}), catch: caught}).pipe(
            Effect.retry({schedule: STATE_RETRY, while: retryable}),
          ),
        )

      const report = () => {
        if (Deferred.isDoneUnsafe(attached) && !ended.aborted)
          run(`state:${crypto.randomUUID()}`, sendState(input.tab()))
      }

      const answer = (requestId: string) =>
        Effect.gen(function* () {
          const abort = new AbortController()
          yield* Effect.addFinalizer((exit) => Effect.sync(() => Exit.hasInterrupts(exit) && abort.abort()))
          const raw = yield* Effect.tryPromise({
            try: (signal) => rpc.command({...attachment, requestId}, {signal}),
            catch: caught,
          })
          const command = Command.safeParse(raw)
          if (!command.success) return yield* reply(requestId, UNSUPPORTED)
          const outcome = yield* Effect.tryPromise({
            try: () => execute(command.data, AbortSignal.any([ended, abort.signal])),
            catch: (cause) => failed('handler-error', cause),
          }).pipe(Effect.catch(Effect.succeed))
          const sent = yield* reply(requestId, outcome)
          if (!sent && command.data.queued?.index === -1) abort.abort()
          return sent
        }).pipe(
          Effect.scoped,
          Effect.catch((cause) =>
            Effect.sync(() => ended.aborted || console.warn('[conciv] page command failed', cause)),
          ),
        )

      const receive = (control: Control) => {
        if (control.type === 'attached') {
          Deferred.doneUnsafe(attached, Exit.void)
          report()
          return
        }
        if (control.type === 'cancel') return void run(control.requestId, Effect.void)
        run(control.requestId, answer(control.requestId))
      }

      const read = Effect.tryPromise({
        try: async (signal): Promise<AttachmentOutcome> => {
          for await (const event of client.event.subscribe({types: [CONTROL, 'session.created'], signal})) {
            if (event.type === 'server.connected') {
              Deferred.doneUnsafe(connected, Exit.void)
              continue
            }
            if (event.type === 'session.created') {
              if (event.data.sessionID === input.session.id) return 'born'
              continue
            }
            const header = ControlHeader.safeParse(event.data)
            if (!header.success || header.data.connectionId !== input.connectionId) continue
            const control = Control.safeParse(event.data)
            if (control.success) receive(control.data)
            else if (header.data.type === 'attached') return 'unsupported'
          }
          return 'closed'
        },
        catch: (): AttachmentOutcome => 'closed',
      }).pipe(Effect.catch(Effect.succeed))

      input.changed(report, ended)
      const reading = yield* Effect.forkScoped(read)
      const joining = Deferred.await(connected).pipe(
        Effect.andThen(
          Effect.tryPromise({
            try: (signal) => rpc.attach({...attachment, version: 1}, {signal}),
            catch: attachmentFailure,
          }),
        ),
        Effect.map((result): AttachmentOutcome => (result === 'replaced' ? 'replaced' : 'closed')),
        Effect.catch(Effect.succeed),
      )
      const outcome = yield* Effect.raceFirst(joining, Fiber.join(reading))
      const wasAttached = Deferred.isDoneUnsafe(attached)
      if (outcome === 'missing') return {outcome: yield* Fiber.join(reading), attached: false}
      if (outcome === 'refused' || outcome === 'transient')
        return {outcome: wasAttached ? 'closed' : outcome, attached: wasAttached}
      return {outcome, attached: wasAttached}
    }),
  )
}

function reportFailure(input: Pick<Attaching, 'notify'>, title: string | undefined, cause: unknown) {
  if (!title) return
  console.warn('[conciv] page attach failed', cause)
  input.notify(title)
}

export function keepAttached(input: Attaching): Effect.Effect<AttachmentEnd> {
  return connectOnce(input).pipe(
    Effect.repeat({schedule: TRANSIENT_RETRY, while: (end) => end.outcome === 'transient'}),
    Effect.tap((end) => (end.outcome === 'closed' && end.attached ? woken() : Effect.void)),
    Effect.repeat({while: (end) => end.outcome === 'born' || (end.outcome === 'closed' && end.attached)}),
    Effect.tap((end) => Effect.sync(() => reportFailure(input, PAGE_TOOLS_OFF[end.outcome], end.outcome))),
    Effect.tapCause((cause) =>
      Effect.sync(() => Cause.hasInterruptsOnly(cause) || reportFailure(input, PAGE_TOOLS_BROKEN, Cause.pretty(cause))),
    ),
  )
}

const TAB_EVENTS = ['focus', 'blur']

const URL_MAX = Tab.shape.url.maxLength ?? Number.POSITIVE_INFINITY

const TITLE_MAX = Tab.shape.title.maxLength ?? Number.POSITIVE_INFINITY

export function readTab(id: string): Tab {
  return {
    id,
    url: redactedUrl(location.href).slice(0, URL_MAX),
    title: document.title.slice(0, TITLE_MAX),
    focused: document.hasFocus(),
    visible: document.visibilityState === 'visible',
  }
}

export function reportRouteChanges(report: () => void, signal: AbortSignal) {
  if (typeof navigation === 'undefined') return
  navigation.addEventListener('currententrychange', report, {signal})
}

export function reportChanges(report: () => void, signal: AbortSignal) {
  TAB_EVENTS.forEach((type) => window.addEventListener(type, report, {signal}))
  document.addEventListener('visibilitychange', report, {signal})
  reportRouteChanges(report, signal)
  const last = {title: document.title}
  const titles = new MutationObserver(() => {
    if (document.title === last.title) return
    last.title = document.title
    report()
  })

  titles.observe(document.head, {childList: true, subtree: true, characterData: true})
  signal.addEventListener('abort', () => titles.disconnect(), {once: true})
}
