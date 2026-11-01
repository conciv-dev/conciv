import {z} from 'zod'
import {type Filter} from './list.js'
import {MODES} from './stage.js'

export const XraySearchSchema = z.object({
  target: z.string().default('').catch(''),
  session: z.string().optional().catch(undefined),
  mode: z.enum(MODES).optional().catch(undefined),
  component: z.string().optional().catch(undefined),
  filter: z
    .enum(['all', 'above', 'unmatched'])
    .transform((value): Filter => (value === 'unmatched' ? 'above' : value))
    .default('all')
    .catch('all'),
  q: z.string().optional().catch(undefined),
  fixture: z.coerce.number().optional().catch(undefined),
})

export type XraySearch = z.infer<typeof XraySearchSchema>
