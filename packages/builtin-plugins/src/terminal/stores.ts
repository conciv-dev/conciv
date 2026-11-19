import {z} from 'zod'
import {Store} from '@conciv/plugin/experimental'

export const terminalDeclarations = {
  stores: {
    prefs: Store.session(z.object({model: z.string().nullable()}), {model: null}),
  },
}
