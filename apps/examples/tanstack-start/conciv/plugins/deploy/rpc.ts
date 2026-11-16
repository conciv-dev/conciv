import {z} from 'zod'
import {Rpc} from '@conciv/plugin/rpc'

export const Deploy = Rpc.define({
  id: 'deploy',
  methods: {run: {input: z.object({env: z.enum(['staging', 'prod'])}), output: z.object({url: z.string()})}},
  events: {},
})
