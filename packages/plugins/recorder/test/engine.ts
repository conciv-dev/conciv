import {resolve} from 'node:path'
import {Effect, type Fiber, Option, type Scope, Stream} from 'effect'
import {PluginEngine} from '@conciv/plugin-testkit'

export const RECORDER_PLUGIN = resolve(import.meta.dirname, '..')

type Events = ReturnType<typeof PluginEngine.events>

type NextEvent = Effect.Effect<
  Fiber.Fiber<Stream.Success<Events>['data'] | undefined>,
  never,
  Stream.Services<Events> | Scope.Scope
>

export const nextControl: NextEvent = PluginEngine.events('rpc.recorder.control').pipe(
  Stream.runHead,
  Effect.map((event) => Option.getOrUndefined(event)?.data),
  Effect.forkScoped({startImmediately: true}),
)
