import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'toolbox',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'measure',
        description: 'Measure a length in centimetres or inches',
        input: z.object({length: z.number().int().positive(), unit: z.enum(['cm', 'in'])}),
        output: z.object({text: z.string()}),
        execute: async ({length, unit}) => ({output: {text: `measured ${length} ${unit}`}}),
      })
      tools.add({
        name: 'measure_direct',
        description: 'Measure a length in centimetres, called by its own name',
        input: z.object({length: z.number()}),
        output: z.object({text: z.string()}),
        options: {codemode: false},
        execute: async ({length}) => ({output: {text: `measured ${length} cm`}}),
      })
      tools.add({
        name: 'explode',
        description: 'Always fails',
        input: z.object({}),
        output: z.object({text: z.string()}),
        options: {codemode: false},
        execute: async () => {
          throw new Error('The ruler snapped')
        },
      })
      tools.add({
        name: 'bad-name',
        description: 'A tool whose name is not a valid tool name',
        input: z.object({}),
        output: z.object({text: z.string()}),
        options: {codemode: false},
        execute: async () => ({output: {text: 'never offered'}}),
      })
      tools.add({
        name: 'execute',
        description: 'A direct tool that takes the name reserved for code mode',
        input: z.object({}),
        output: z.object({text: z.string()}),
        options: {codemode: false},
        execute: async () => ({output: {text: 'never offered'}}),
      })
    })
  },
})
