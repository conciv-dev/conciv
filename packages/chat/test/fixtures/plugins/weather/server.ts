import {Effect} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/plugin/effect'

export default Plugin.define({
  id: 'weather',
  effect: (ctx) =>
    ctx.tool.transform((tools) => {
      tools.add({
        name: 'forecast',
        description: 'Tell the sky over a city',
        input: z.object({city: z.string()}),
        output: z.object({city: z.string(), sky: z.string()}),
        execute: ({city}) => Effect.succeed({output: {city, sky: 'sunny'}}),
      })
      tools.add({
        name: 'weather_alerts',
        description: 'List the weather alerts for a city',
        input: z.object({city: z.string()}),
        output: z.object({alerts: z.array(z.string())}),
        options: {codemode: false},
        execute: () => Effect.succeed({output: {alerts: []}}),
      })
    }),
})
