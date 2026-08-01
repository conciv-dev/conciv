import {z} from 'zod'

export const looseSearchSchema = z.object({
  token: z.string().optional(),
})
