import {Deferred, Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api/effect'

const HookSchema = z.object({hook: z.enum(['prompt', 'context'])})

type Hold = {held: Deferred.Deferred<void>; released: Deferred.Deferred<void>}

const makeHold = Effect.gen(function* () {
  const hold: Hold = {held: yield* Deferred.make<void>(), released: yield* Deferred.make<void>()}
  return hold
})

function holdFirst(hold: Hold): Effect.Effect<void> {
  return Deferred.succeed(hold.held, undefined).pipe(
    Effect.flatMap((first) => (first ? Deferred.await(hold.released) : Effect.void)),
  )
}

export default Plugin.define({
  id: 'turn-holder',
  effect: (ctx) =>
    Effect.gen(function* () {
      const holds = {prompt: yield* makeHold, context: yield* makeHold}
      yield* ctx.session.hook('prompt', () => holdFirst(holds.prompt))
      yield* ctx.session.hook('context', () => holdFirst(holds.context))
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'turn_held',
          description: 'Wait until the first turn to reach a hook is held there',
          input: HookSchema,
          output: z.object({}),
          execute: ({hook}) => Deferred.await(holds[hook].held).pipe(Effect.as({output: {}})),
        })
        tools.add({
          name: 'turn_release',
          description: 'Let the turn held at a hook go on',
          input: HookSchema,
          output: z.object({}),
          execute: ({hook}) => Deferred.succeed(holds[hook].released, undefined).pipe(Effect.as({output: {}})),
        })
      })
    }),
})
