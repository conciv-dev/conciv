import {z} from 'zod'

export const rootSearchSchema = z.object({
  widget: z.boolean().optional().catch(undefined),
  try: z.literal(1).optional().catch(undefined),
})

const docsHeaderVariants = ['a', 'b', 'c'] as const

export type DocsHeaderVariant = (typeof docsHeaderVariants)[number]

export const docsSearchDefaults = {header: 'a'} as const

export const docsSearchSchema = z.object({
  header: z.enum(docsHeaderVariants).default(docsSearchDefaults.header).catch(docsSearchDefaults.header),
})
