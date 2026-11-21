import {z} from 'zod'
import {Plugin} from '@conciv/plugin'

export default Plugin.define({
  id: 'request-shaper',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'shaped_tool',
        description: 'Looks up a topic',
        input: z.object({topic: z.string()}),
        output: z.object({topic: z.string()}),
        options: {codemode: false},
        execute: async ({topic}) => ({output: {topic}}),
      })
      tools.add({
        name: 'hidden_tool',
        description: 'A tool the context hook keeps from the model',
        input: z.object({}),
        output: z.object({hidden: z.boolean()}),
        options: {codemode: false},
        execute: async () => ({output: {hidden: true}}),
      })
    })
    await ctx.session.hook('prompt', (event) => {
      event.prompt.text = `${event.prompt.text}, from the prompt hook`
    })
    await ctx.session.hook('context', (event) => {
      event.system.push({type: 'text', text: 'Answer in one short sentence.'})
      event.messages.push({role: 'user', content: 'Reminder from the context hook.'})
      event.options.temperature = 0.2
      const shaped = event.tools['shaped_tool']
      if (shaped !== undefined) {
        shaped.description = 'Looks up a topic, shaped by the context hook'
        shaped.input = {
          type: 'object',
          properties: {topic: {type: 'string'}, depth: {type: 'number'}},
          required: ['topic'],
        }
      }
      delete event.tools['hidden_tool']
    })
  },
})
