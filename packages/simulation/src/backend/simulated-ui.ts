import {implement} from '@orpc/server'
import {Deferred, Effect} from 'effect'
import {z} from 'zod'
import type {EvlogError} from 'evlog'
import {define as definePlugin, type Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import {
  dispatchHandshake,
  SemanticSnapshotSchema,
  uiContract,
  UiStateSchema,
  simulationErrors,
  WidgetDrive,
  type UiCapability,
  type WidgetOutcome,
  type WidgetRequest,
} from '@conciv/protocol/simulation'
import * as SimulationControlServer from '../control-server.js'

const WIDGET_CAPABILITIES: readonly UiCapability[] = [
  'ui.type',
  'ui.press',
  'ui.enter',
  'ui.arrow',
  'ui.focus',
  'ui.click',
  'ui.click.semantic',
  'ui.matches',
  'ui.state',
  'ui.snapshot',
]

type Ask = (request: WidgetRequest) => Effect.Effect<WidgetOutcome, unknown>

function makeRouter(ask: Ask, version: string) {
  const os = implement(uiContract).$context<SimulationControlServer.Context>()
  const forward = <T>(schema: z.ZodType<T>, request: WidgetRequest): Effect.Effect<T, unknown> =>
    ask(request).pipe(
      Effect.flatMap((outcome) =>
        outcome.type === 'failure'
          ? Effect.fail(simulationErrors.UI_ACTION_FAILED({message: outcome.message}))
          : Effect.try({try: () => schema.parse(outcome.value), catch: (error) => error}),
      ),
    )
  const unsupported = (name: string): Effect.Effect<never, EvlogError> =>
    Effect.fail(simulationErrors.UI_ACTION_FAILED({message: `the widget does not support ${name}`}))
  return os.router({
    handshake: os.handshake.effect(function* ({input}) {
      const outcome = dispatchHandshake(
        {role: 'ui', server: {name: 'conciv', version}, capabilities: WIDGET_CAPABILITIES},
        input,
      )
      if (outcome.type === 'accepted') return outcome.response
      return yield* Effect.fail(outcome.refusal)
    }),
    ui: {
      state: os.ui.state.effect(function* () {
        return yield* forward(UiStateSchema, {type: 'ui.state'})
      }),
      snapshot: os.ui.snapshot.effect(function* () {
        return yield* forward(SemanticSnapshotSchema, {type: 'ui.snapshot'})
      }),
      matches: os.ui.matches.effect(function* ({input}) {
        return yield* forward(z.boolean(), {type: 'ui.matches', ...input})
      }),
      type: os.ui.type.effect(function* ({input}) {
        return yield* forward(UiStateSchema, {type: 'ui.type', ...input})
      }),
      press: os.ui.press.effect(function* ({input}) {
        return yield* forward(UiStateSchema, {type: 'ui.press', ...input})
      }),
      enter: os.ui.enter.effect(function* () {
        return yield* forward(UiStateSchema, {type: 'ui.enter'})
      }),
      arrow: os.ui.arrow.effect(function* ({input}) {
        return yield* forward(UiStateSchema, {type: 'ui.arrow', ...input})
      }),
      focus: os.ui.focus.effect(function* ({input}) {
        return yield* forward(UiStateSchema, {type: 'ui.focus', ...input})
      }),
      click: os.ui.click.effect(function* ({input}) {
        return yield* forward(UiStateSchema, {type: 'ui.click', ...input})
      }),
      capture: os.ui.capture.effect(function* () {
        return yield* unsupported('ui.capture')
      }),
      recording: {
        finish: os.ui.recording.finish.effect(function* () {
          return yield* unsupported('ui.recording.finish')
        }),
      },
      mouse: os.ui.mouse.effect(function* () {
        return yield* unsupported('ui.mouse')
      }),
      resize: os.ui.resize.effect(function* () {
        return yield* unsupported('ui.resize')
      }),
    },
  })
}

export type WidgetDriveOptions = {readonly endpoint: string; readonly version: string}

export function widgetDrivePlugin(options: WidgetDriveOptions): Plugin {
  return definePlugin({
    id: WidgetDrive.id,
    effect: (ctx) =>
      Effect.gen(function* () {
        const pending = new Map<string, Deferred.Deferred<WidgetOutcome>>()
        const registration = yield* ctx.rpc.register(WidgetDrive, {
          result: (input) =>
            Effect.suspend(() => {
              const waiting = pending.get(input.requestId)
              return waiting === undefined ? Effect.void : Deferred.succeed(waiting, input.outcome).pipe(Effect.asVoid)
            }),
        })
        const ask: Ask = (request) => {
          const requestId = crypto.randomUUID()
          return Effect.acquireUseRelease(
            Deferred.make<WidgetOutcome>().pipe(
              Effect.tap((answer) => Effect.sync(() => pending.set(requestId, answer))),
            ),
            (answer) =>
              registration.events.emit('call', {requestId, request}).pipe(Effect.andThen(Deferred.await(answer))),
            () => Effect.sync(() => pending.delete(requestId)),
          )
        }
        const server = yield* SimulationControlServer.start({
          endpoint: new URL(options.endpoint),
          label: 'conciv drive ui websocket',
          router: makeRouter(ask, options.version),
          close: () => Effect.void,
        })
        yield* Effect.sync(() => process.stderr.write(`conciv drive ui websocket: ${server.url}\n`))
      }).pipe(Effect.catch((error) => Effect.logError('conciv drive ui websocket did not start', error))),
  })
}
