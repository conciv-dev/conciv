import {z} from 'zod'

export const DoneCardSchema = z
  .object({
    message: z.string(),
    summary: z.string(),
    filesChanged: z.array(z.string()),
    pageActions: z.array(z.string()),
    testsPassed: z.boolean(),
  })
  .strict()

export type DoneCard = z.infer<typeof DoneCardSchema>
