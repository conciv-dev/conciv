import {z} from 'zod'
import {FILTERS, type Filter} from './data.js'
import {MODES} from './stage.js'

export const VIEWS = ['list', 'capture'] as const
export type View = (typeof VIEWS)[number]

export const XraySearchSchema = z.object({
  target: z.string().default('').catch(''),
  session: z.string().optional().catch(undefined),
  mode: z.enum(MODES).optional().catch(undefined),
  component: z.string().optional().catch(undefined),
  filter: z
    .enum([...FILTERS, 'unmatched'])
    .transform((value): Filter => (value === 'unmatched' ? 'above' : value))
    .default('all')
    .catch('all'),
  view: z.enum(VIEWS).default('list').catch('list'),
  q: z.string().optional().catch(undefined),
  fixture: z.coerce.number().optional().catch(undefined),
})

export type XraySearch = z.infer<typeof XraySearchSchema>
