import {z} from 'zod'

export const sessionPickerSearchSchema = z.object({
  open: z.literal(true).optional().catch(undefined),
  sessionSearch: z.coerce.string().default('').catch(''),
  allProjects: z.boolean().default(false).catch(false),
})
