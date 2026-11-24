import {Cause, Deferred, Duration, Effect, Exit, Fiber, FiberMap, Option, Schedule, Semaphore, Stream} from 'effect'
import {z} from 'zod'
import type {MountedSession} from '@conciv/plugin/experimental'
import type {PageOperation} from '@conciv/plugin-page/contract'
import {Command, Control, Definition, Outcome, Tab} from '@conciv/plugin-page/rpc'
import type {PageOperations} from './operations.js'
import {redactedUrl} from './redacted-url.js'
import {settleAttachment, startAttachment, transitionAttachment} from './attachment-machine.js'
import type {
  AttachmentEffect,
  AttachmentEnd,
  AttachmentEvent,
  AttachmentOutcome,
  AttachmentTransition,
} from './attachment-machine.js'

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

const WAKE_EVENTS = ['focus', 'pointerdown', 'keydown']

const ControlHeader = z.object({type: z.string(), connectionId: z.string()})

const RpcFailure = z.object({type: z.string()})

const UNSUPPORTED: Outcome = {
  type: 'failure',
  code: 'unsupported',
  message:
    'This page does not support the requested page operation. Ask the user to reload the page so it runs the same conciv version as the engine, or use another operation.',
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

      const read = Stream.fromAsyncIterable(
        client.event.subscribe({types: [CONTROL, 'session.created'], signal: ended}),
        caught,
      ).pipe(
        Stream.map((event): AttachmentOutcome | undefined => {
          if (event.type === 'server.connected') {
            Deferred.doneUnsafe(connected, Exit.void)
            return undefined
          }
          if (event.type === 'session.created') return event.data.sessionID === input.session.id ? 'born' : undefined
          const header = ControlHeader.safeParse(event.data)
          if (!header.success || header.data.connectionId !== input.connectionId) return undefined
          const control = Control.safeParse(event.data)
          if (control.success) {
            receive(control.data)
            return undefined
          }
          return header.data.type === 'attached' ? 'unsupported' : undefined
        }),
        Stream.filter((outcome) => outcome !== undefined),
        Stream.runHead,
        Effect.map(Option.getOrElse((): AttachmentOutcome => 'closed')),
        Effect.catch((cause) =>
          ended.aborted
            ? Effect.succeed<AttachmentOutcome>('closed')
            : Effect.logWarning('Page event subscription failed', cause).pipe(Effect.as<AttachmentOutcome>('closed')),
        ),
      )

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
      if (outcome === 'missing') return {outcome: yield* Fiber.join(reading), attached: false}
      return settleAttachment(outcome, Deferred.isDoneUnsafe(attached))
    }),
  )
}

function reportFailure(input: Pick<Attaching, 'notify'>, title: string, cause: unknown) {
  console.warn('[conciv] page attach failed', cause)
  input.notify(title)
}

function perform(input: Attaching, effect: AttachmentEffect): Effect.Effect<AttachmentEvent | undefined> {
  switch (effect.type) {
    case 'connect':
      return connectOnce(input).pipe(Effect.map((end): AttachmentEvent => ({type: 'ended', end})))
    case 'wait-backoff':
      return Effect.sleep(Duration.millis(effect.delayMillis)).pipe(Effect.as<AttachmentEvent>({type: 'backed-off'}))
    case 'wait-wake':
      return woken().pipe(Effect.as<AttachmentEvent>({type: 'woken'}))
    case 'notify':
      return Effect.sync(() => reportFailure(input, effect.title, effect.outcome)).pipe(Effect.as(undefined))
    case 'stop':
      return Effect.succeed(undefined)
  }
}

function drive(input: Attaching, transition: AttachmentTransition): Effect.Effect<void> {
  return Effect.forEach(transition.effects, (effect) => perform(input, effect)).pipe(
    Effect.flatMap((events) => {
      const event = events.find((next) => next !== undefined)
      return event ? drive(input, transitionAttachment(transition.state, event)) : Effect.void
    }),
  )
}

export function keepAttached(input: Attaching): Effect.Effect<void> {
  return drive(input, startAttachment).pipe(
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
