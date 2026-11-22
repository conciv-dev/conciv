import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'

export default Plugin.define({
  id: 'shelf',
  effect: (ctx) =>
    ctx.tool.transform((tools) => {
      tools.add({
        name: 'shelf_count',
        description: 'Count the books on a shelf',
        input: z.object({shelf: z.string()}),
        output: z.object({shelf: z.string(), count: z.number()}),
        execute: ({shelf}) => Effect.succeed({output: {shelf, count: 3}}),
      })
      tools.add({
        name: 'shelf_dump',
        description: 'Read every title on the shelf aloud',
        input: z.object({}),
        output: z.object({titles: z.string()}),
        execute: () => Effect.succeed({output: {titles: 'book '.repeat(12_000)}}),
      })
      tools.add({
        name: 'shelf_photo',
        description: 'Take a photo of the shelf',
        input: z.object({}),
        execute: () =>
          Effect.succeed({
            content: [
              {
                type: 'file',
                uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
                mime: 'image/png',
              },
            ],
          }),
      })
      tools.add({
        name: 'shelf_reset',
        description: 'Put every book back in order',
        input: z.object({}),
        output: z.object({reset: z.boolean()}),
        options: {codemode: false},
        execute: () => Effect.succeed({output: {reset: true}}),
      })
    }),
})
