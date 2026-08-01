import {z} from 'zod'

export const rootSearchSchema = z.object({
  widget: z.boolean().optional().catch(undefined),
})

export const indexSearchSchema = z.object({
  try: z.literal(1).optional().catch(undefined),
})
