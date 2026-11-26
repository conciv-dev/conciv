import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api/effect'
import * as Tool from '@conciv/protocol/schema/tool'

export default Plugin.define({
  id: 'release-train',
  effect: (ctx) =>
    ctx.tool.transform((tools) => {
      tools.add({
        name: 'release_check',
        description: 'Check whether a branch can ship',
        input: z.object({branch: z.string()}),
        output: z.object({verdict: z.string()}),
        execute: () => Effect.succeed({output: {verdict: 'ready'}}),
      })
      tools.add({
        name: 'release_block',
        description: 'Hold a branch back from shipping',
        input: z.object({branch: z.string()}),
        output: z.object({held: z.boolean()}),
        execute: () => Effect.fail(Tool.toolError({message: 'The release train is frozen'})),
      })
      tools.add({
        name: 'release_notes',
        description: 'Draft the notes for a branch',
        input: z.object({branch: z.string()}),
        output: z.object({notes: z.string()}),
        execute: () => Effect.succeed({output: {notes: 'Faster login'}}),
      })
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
