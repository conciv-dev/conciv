import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api/effect'

export default Plugin.define({
  id: 'asking-notes',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* ctx.tool.transform((tools) => {
        tools.add({
          name: 'notes_publish',
          description: 'Publish the notes once the user allows it',
          input: z.object({title: z.string()}),
          output: z.object({published: z.string()}),
          execute: ({title}, tool) =>
            ctx.permission
              .assert({
                action: 'notes_publish',
                resources: [title],
                save: [],
                fallback: 'ask',
                sessionId: tool.sessionId,
                agent: tool.agent,
                source: {type: 'tool', messageId: tool.messageId, id: tool.id},
              })
              .pipe(Effect.as({output: {published: title}})),
        })
      })
    }),
})
