import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'

export default Plugin.define({
  id: 'release-train',
  effect: (ctx) =>
    ctx.tool.transform((tools) => {
      tools.add({
        name: 'release_window',
        description: 'Tell when a branch may ship',
        input: z.object({branch: z.string()}),
        output: z.object({window: z.string()}),
        execute: () => Effect.succeed({output: {window: 'noon to two'}}),
      })
      tools.add({
        name: 'release_rollback',
        description: 'Roll a branch back each time the user allows it',
        input: z.object({branch: z.string()}),
        output: z.object({rolledBack: z.boolean()}),
        execute: ({branch}, tool) =>
          ctx.permission
            .assert({
              action: 'release_rollback',
              resources: [branch],
              save: [],
              fallback: 'ask',
              metadata: {},
              sessionId: tool.sessionId,
              agent: tool.agent,
              source: {type: 'tool', messageId: tool.messageId, id: tool.id},
            })
            .pipe(Effect.as({output: {rolledBack: true}})),
      })
      tools.add({
        name: 'release_ship',
        description: 'Ship a branch once the user allows it',
        input: z.object({branch: z.string()}),
        output: z.object({shipped: z.boolean()}),
        execute: ({branch}, tool) =>
          ctx.permission
            .assert({
              action: 'release_ship',
              resources: [branch],
              save: [branch],
              fallback: 'ask',
              metadata: {},
              sessionId: tool.sessionId,
              agent: tool.agent,
              source: {type: 'tool', messageId: tool.messageId, id: tool.id},
            })
            .pipe(Effect.as({output: {shipped: true}})),
      })
    }),
})
