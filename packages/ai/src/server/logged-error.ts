import {z} from 'zod'

const NamedErrorSchema = z.object({name: z.string(), message: z.string()})

export function formatLoggedError(message: string, error: unknown): string {
  if (error === undefined) return `[ai] ${message}`
  const named = NamedErrorSchema.safeParse(error)
  return `[ai] ${message}: ${named.success ? `${named.data.name}: ${named.data.message}` : String(error)}`
}
