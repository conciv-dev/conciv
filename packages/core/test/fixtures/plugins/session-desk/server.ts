import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'

export default Plugin.define({
  id: 'session-desk',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'sessions_titles',
          description: 'List the titles of the sessions of this project',
          input: z.object({}),
          output: z.object({titles: z.array(z.string())}),
          execute: () =>
            ctx.session.list().pipe(
              Effect.orDie,
              Effect.map(({data}) => ({output: {titles: data.map((session) => session.title ?? '')}})),
            ),
        })
        tools.add({
          name: 'sessions_rename',
          description: 'Rename the session that calls the tool',
          input: z.object({title: z.string()}),
          output: z.object({title: z.string()}),
          execute: ({title}, tool) =>
            ctx.session.update({sessionId: tool.sessionId, title}).pipe(
              Effect.andThen(ctx.session.get({sessionId: tool.sessionId})),
              Effect.orDie,
              Effect.map((session) => ({output: {title: session.title ?? ''}})),
            ),
        })
        tools.add({
          name: 'models_names',
          description: 'List the names of the models the harness offers',
          input: z.object({}),
          output: z.object({names: z.array(z.string())}),
          execute: () =>
            ctx.model.list().pipe(
              Effect.orDie,
              Effect.map(({data}) => ({output: {names: data.map((model) => model.name)}})),
            ),
        })
      })
    }),
})
