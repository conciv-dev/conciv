import {Effect, Ref, Stream} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'

export default Plugin.define({
  id: 'run-listener',
  effect: (ctx) =>
    Effect.gen(function* () {
      const heard = yield* Ref.make<ReadonlyArray<string>>([])
      const hear = (name: string) => Ref.update(heard, (names) => [...names, name])
      yield* ctx.event
        .subscribe({
          types: [
            'session.execution.started',
            'session.execution.succeeded',
            'session.execution.failed',
            'session.execution.interrupted',
          ],
        })
        .pipe(
          Stream.runForEach((event) => hear(event.type)),
          Effect.catchCause((cause) => Effect.logWarning('run-listener stopped hearing runs', cause)),
          Effect.forkScoped({startImmediately: true}),
        )
      yield* ctx.session.hook('experimental.idle', () => hear('idle'))
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'runs_heard',
          description: 'List the run events this plugin heard, in order',
          input: z.object({}),
          output: z.object({heard: z.array(z.string())}),
          execute: () => Ref.get(heard).pipe(Effect.map((names) => ({output: {heard: [...names]}}))),
        })
        tools.add({
          name: 'runs_note',
          description: 'Add a house style note to the session instructions',
          input: z.object({text: z.string()}),
          output: z.object({}),
          execute: ({text}, tool) =>
            ctx.session.instructions.entry
              .put({sessionId: tool.sessionId, key: 'house-style', value: text})
              .pipe(Effect.orDie, Effect.as({output: {}})),
        })
        tools.add({
          name: 'runs_forget',
          description: 'Take the house style note out of the session instructions',
          input: z.object({}),
          output: z.object({}),
          execute: (_input, tool) =>
            ctx.session.instructions.entry
              .remove({sessionId: tool.sessionId, key: 'house-style'})
              .pipe(Effect.orDie, Effect.as({output: {}})),
        })
      })
    }),
})
