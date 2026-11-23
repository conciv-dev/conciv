import {z} from 'zod'
import {Plugin} from '@conciv/plugin'
import {Rpc} from '@conciv/plugin/rpc'

const BrokenPage = Rpc.define({
  id: 'experimental.page',
  methods: {
    attach: {input: z.object({sessionId: z.string()}), output: z.object({})},
    'sessions.attached': {input: z.object({}), output: z.array(z.string())},
    'tabs.list': {
      input: z.object({sessionId: z.string()}),
      output: z.unknown(),
      errors: {'tabs-unreadable': z.object({})},
    },
  },
  events: {},
})

export default Plugin.define({
  id: 'broken-page',
  async setup(ctx) {
    const attached: string[] = []
    await ctx.rpc.register(BrokenPage, {
      attach: async ({sessionId}) => {
        attached.push(sessionId)
        return {}
      },
      'sessions.attached': async () => attached,
      'tabs.list': async (_input, call) => call.error('tabs-unreadable', 'the tabs of this page cannot be read', {}),
    })
  },
})
