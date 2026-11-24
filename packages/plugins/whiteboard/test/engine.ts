import {resolve} from 'node:path'
import {Effect, type Fiber, Option, type Scope, Stream} from 'effect'
import {PluginEngine} from '@conciv/plugin-testkit'
import {z} from 'zod'

export const WHITEBOARD_PLUGIN = resolve(import.meta.dirname, '..')

type Events = ReturnType<typeof PluginEngine.events>

type NextEvent = Effect.Effect<
  Fiber.Fiber<Stream.Success<Events> | undefined>,
  never,
  Stream.Services<Events> | Scope.Scope
>

export const nextEvent = (type: `rpc.${string}`, matches: z.ZodType = z.unknown()): NextEvent =>
  PluginEngine.events(type).pipe(
    Stream.filter((event) => matches.safeParse(event.data).success),
    Stream.runHead,
    Effect.map(Option.getOrUndefined),
    Effect.forkScoped({startImmediately: true}),
  )
