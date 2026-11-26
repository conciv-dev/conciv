import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'

export default Plugin.define({
  id: 'notebook',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'note_write',
        description: 'Keep a note in plugin storage',
        input: z.object({key: z.string(), value: z.string()}),
        output: z.object({kept: z.string()}),
        execute: async ({key, value}) => {
          await ctx.storage.set(key, value)
          return {output: {kept: key}}
        },
      })
      tools.add({
        name: 'note_read',
        description: 'Read a note back from plugin storage',
        input: z.object({key: z.string()}),
        output: z.object({value: z.unknown()}),
        execute: async ({key}) => ({output: {value: (await ctx.storage.get(key)) ?? null}}),
      })
      tools.add({
        name: 'note_directory',
        description: 'Report the folder this plugin may keep files in',
        input: z.object({}),
        output: z.object({directory: z.string()}),
        execute: async () => ({output: {directory: ctx.storage.directory}}),
      })
    })
  },
})
