import {implement} from '@orpc/server'
import {Deferred, Effect} from 'effect'
import {z} from 'zod'
import {define as definePlugin, type Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import {
  dispatchHandshake,
  SemanticSnapshotSchema,
  uiContract,
  UiStateSchema,
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

type Ask = (request: WidgetRequest, signal: AbortSignal | undefined) => Promise<WidgetOutcome>

type ActionErrors = {readonly UI_ACTION_FAILED: (options: {message: string}) => Error}

function makeRouter(ask: Ask, version: string) {
  const os = implement(uiContract).$context<SimulationControlServer.Context>()
  const forward = async <T>(
    schema: z.ZodType<T>,
    request: WidgetRequest,
    signal: AbortSignal | undefined,
    errors: ActionErrors,
  ): Promise<T> => {
    const outcome = await ask(request, signal)
    if (outcome.type === 'failure') throw errors.UI_ACTION_FAILED({message: outcome.message})
    return schema.parse(outcome.value)
  }
  const unsupported = (errors: ActionErrors, name: string): never => {
    throw errors.UI_ACTION_FAILED({message: `the widget does not support ${name}`})
  }
  return os.router({
    handshake: os.handshake.handler(({input, errors}) => {
      const outcome = dispatchHandshake(
        {role: 'ui', server: {name: 'conciv', version}, capabilities: WIDGET_CAPABILITIES},
        input,
      )
      if (outcome.type === 'accepted') return outcome.response
      const refused = outcome.refusal
      if (refused.code === 'ROLE_MISMATCH') throw errors.ROLE_MISMATCH(refused)
      if (refused.code === 'UNSUPPORTED_PROTOCOL') throw errors.UNSUPPORTED_PROTOCOL(refused)
      throw errors.MISSING_CAPABILITY(refused)
    }),
    ui: {
      state: os.ui.state.handler(({signal, errors}) => forward(UiStateSchema, {type: 'ui.state'}, signal, errors)),
      snapshot: os.ui.snapshot.handler(({signal, errors}) =>
        forward(SemanticSnapshotSchema, {type: 'ui.snapshot'}, signal, errors),
      ),
      matches: os.ui.matches.handler(({input, signal, errors}) =>
        forward(z.boolean(), {type: 'ui.matches', ...input}, signal, errors),
      ),
      type: os.ui.type.handler(({input, signal, errors}) =>
        forward(UiStateSchema, {type: 'ui.type', ...input}, signal, errors),
      ),
      press: os.ui.press.handler(({input, signal, errors}) =>
        forward(UiStateSchema, {type: 'ui.press', ...input}, signal, errors),
      ),
      enter: os.ui.enter.handler(({signal, errors}) => forward(UiStateSchema, {type: 'ui.enter'}, signal, errors)),
      arrow: os.ui.arrow.handler(({input, signal, errors}) =>
        forward(UiStateSchema, {type: 'ui.arrow', ...input}, signal, errors),
      ),
      focus: os.ui.focus.handler(({input, signal, errors}) =>
        forward(UiStateSchema, {type: 'ui.focus', ...input}, signal, errors),
      ),
      click: os.ui.click.handler(({input, signal, errors}) =>
        forward(UiStateSchema, {type: 'ui.click', ...input}, signal, errors),
      ),
      capture: os.ui.capture.handler(({errors}) => unsupported(errors, 'ui.capture')),
      recording: {finish: os.ui.recording.finish.handler(({errors}) => unsupported(errors, 'ui.recording.finish'))},
      mouse: os.ui.mouse.handler(({errors}) => unsupported(errors, 'ui.mouse')),
      resize: os.ui.resize.handler(({errors}) => unsupported(errors, 'ui.resize')),
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
        const ask: Ask = (request, signal) => {
          const requestId = crypto.randomUUID()
          return Effect.runPromise(
            Effect.acquireUseRelease(
              Deferred.make<WidgetOutcome>().pipe(
                Effect.tap((answer) => Effect.sync(() => pending.set(requestId, answer))),
              ),
              (answer) =>
                registration.events.emit('call', {requestId, request}).pipe(Effect.andThen(Deferred.await(answer))),
              () => Effect.sync(() => pending.delete(requestId)),
            ),
            {signal},
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
