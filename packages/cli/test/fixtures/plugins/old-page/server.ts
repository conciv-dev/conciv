import {z} from 'zod'
import {Plugin} from '@conciv/plugin'
import {Rpc} from '@conciv/plugin/rpc'

const OldPage = Rpc.define({
  id: 'experimental.page',
  methods: {
    'sessions.attached': {input: z.object({}), output: z.unknown()},
    'tabs.list': {input: z.object({sessionId: z.string()}), output: z.unknown()},
  },
  events: {},
})

export default Plugin.define({
  id: 'old-page',
  async setup(ctx) {
    await ctx.rpc.register(OldPage, {
      'sessions.attached': async () => ({sessions: 'every one'}),
      'tabs.list': async () => ({open: true}),
    })
  },
})
