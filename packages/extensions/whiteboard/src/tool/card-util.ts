import {z} from 'zod'

export const FailureDetailSchema = z.object({error: z.string(), reason: z.string().optional()}).loose()

export function failureOf(detail: unknown): z.infer<typeof FailureDetailSchema> | null {
  const parsed = FailureDetailSchema.safeParse(detail)
  return parsed.success ? parsed.data : null
}
