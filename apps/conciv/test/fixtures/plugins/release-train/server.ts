import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'
import {Tool} from '@conciv/plugin/schema/tool'

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
    }),
})
