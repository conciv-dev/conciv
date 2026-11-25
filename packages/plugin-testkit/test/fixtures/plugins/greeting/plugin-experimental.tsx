import {Plugin, Server, type ServerEntry} from '@conciv/frontend-plugin-api'
import {z} from 'zod'

const GreetingOptions = z.object({greeting: z.string()})

export default Plugin.define({
  setup(ctx) {
    const {greeting} = GreetingOptions.parse(ctx.options)
    const entry: ServerEntry = {id: 'greeting', name: 'Greeting', state: 'starting', cover: () => <h1>{greeting}</h1>}
    ctx.add(Server, () => ({ready: true, entries: [entry]}))
  },
})
