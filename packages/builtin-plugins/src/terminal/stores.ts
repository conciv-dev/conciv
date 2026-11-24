import {z} from 'zod'
import {Store} from '@conciv/plugin/experimental'

export const terminalDeclarations = {
  stores: {
    prefs: Store.global(
      z.object({model: z.string().nullable(), sessions: z.record(z.string(), z.string()).default({})}),
      {model: null, sessions: {}},
    ),
  },
}
