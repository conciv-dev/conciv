import {Effect, Exit, FiberMap, Semaphore, Stream} from 'effect'
import {z} from 'zod'
import type {BaseContext, MountedSession} from '@conciv/frontend-plugin-api'
import type {PageOperation} from '@conciv/frontend-plugin-api/page'
import {Command, Control, Definition, Outcome} from './rpc.js'
import type {PageOperations} from './operations.js'

export type Answering = {
  readonly session: MountedSession
  readonly operations: PageOperations
  readonly registered: () => readonly PageOperation[]
  readonly log: BaseContext['log']
}

const CONTROL: `rpc.${typeof Definition.id}.control` = `rpc.${Definition.id}.control`

const UNSUPPORTED: Outcome = {
  type: 'failure',
  code: 'unsupported',
  message:
    'This page does not support the requested page operation. Ask the user to reload the page so it runs the same conciv version as the engine, or use another operation.',
}

function failed(code: string, cause: unknown): Outcome {
  return {type: 'failure', code, message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 2048)}
}

function caught(cause: unknown) {
  return cause
}

function dispatchCommand(answering: Pick<Answering, 'operations' | 'registered'>) {
  return (command: Command, signal: AbortSignal): Promise<Outcome> => {
    const {action} = command
    if (action.type !== 'operation') return answering.operations.execute({...command, action}, signal)
    const operation = answering.registered().find((entry) => entry.name === action.name)
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

export function answerCommands(input: Answering): Effect.Effect<void> {
  return Effect.scoped(
    Effect.gen(function* () {
      const client = input.session.server.client
      const rpc = client.rpc(Definition)
      const owner = {sessionId: input.session.id, tabId: input.session.browserTab.id}
      const execute = dispatchCommand(input)
      const ending = new AbortController()
      yield* Effect.addFinalizer(() => Effect.sync(() => ending.abort()))
      const ended = ending.signal
      const outbound = yield* Semaphore.make(1)
      const calls = yield* FiberMap.make<string>()
      const run = yield* FiberMap.runtime(calls)()

      const reply = (requestId: string, outcome: Outcome) =>
        outbound
          .withPermit(
            Effect.tryPromise({
              try: () => rpc.result({...owner, requestId, outcome: z.encode(Outcome, outcome)}),
              catch: caught,
            }),
          )
          .pipe(
            Effect.tapError((cause) =>
              Effect.sync(
                () =>
                  ended.aborted ||
                  input.log.warn({
                    action: 'page',
                    message: 'page send failed',
                    sessionId: owner.sessionId,
                    error: cause,
                  }),
              ),
            ),
            Effect.exit,
            Effect.map(Exit.isSuccess),
          )

      const answer = (requestId: string) =>
        Effect.gen(function* () {
          const abort = new AbortController()
          yield* Effect.addFinalizer((exit) => Effect.sync(() => Exit.hasInterrupts(exit) && abort.abort()))
          const raw = yield* Effect.tryPromise({
            try: (signal) => rpc.command({...owner, requestId}, {signal}),
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
            Effect.sync(
              () =>
                ended.aborted ||
                input.log.warn({
                  action: 'page',
                  message: 'page command failed',
                  sessionId: owner.sessionId,
                  error: cause,
                }),
            ),
          ),
        )

      yield* Stream.fromAsyncIterable(client.event.subscribe({types: [CONTROL], signal: ended}), caught).pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            const control = Control.safeParse(event.data)
            if (!control.success || control.data.tabId !== owner.tabId) return
            if (control.data.type === 'cancel') return void run(control.data.requestId, Effect.void)
            run(control.data.requestId, answer(control.data.requestId))
          }),
        ),
        Effect.catch((cause) =>
          Effect.sync(
            () =>
              ended.aborted ||
              input.log.warn({
                action: 'page',
                message: 'page event subscription failed',
                sessionId: owner.sessionId,
                error: cause,
              }),
          ),
        ),
      )
    }),
  )
}
