import {z} from 'zod'

export const Source = z.union([
  z.object({
    type: z.literal('tool'),
    messageId: z.union([z.string(), z.undefined()]),
    id: z.string(),
  }),
])

export type Source = z.infer<typeof Source>

export type Effect = 'allow' | 'deny' | 'ask'

export interface Rule {
  readonly action: string
  readonly resource: string
  readonly effect: Effect
}

export type Ruleset = ReadonlyArray<Rule>
