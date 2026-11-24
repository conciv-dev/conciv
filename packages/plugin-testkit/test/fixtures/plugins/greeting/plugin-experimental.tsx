import {Plugin, Server, Store, type ServerEntry} from '@conciv/plugin/experimental'
import {z} from 'zod'

const GreetingOptions = z.object({greeting: z.string()})

export default Plugin.define({
  stores: {waves: Store.global(z.object({count: z.number()}), {count: 0})},
  setup(ctx) {
    const {greeting} = GreetingOptions.parse(ctx.options)
    const waves = ctx.stores.waves
    const entry: ServerEntry = {
      id: 'greeting',
      name: 'Greeting',
      state: 'starting',
      cover: () => (
        <>
          <h1>{greeting}</h1>
          <button type="button" onClick={() => waves.update((draft) => void (draft.count += 1))}>
            Waved {waves.value.count} times
          </button>
        </>
      ),
    }
    ctx.add(Server, () => ({ready: true, entries: [entry]}))
  },
})
