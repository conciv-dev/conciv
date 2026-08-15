import {z} from 'zod'

const repoStatsSchema = z.object({
  stargazers_count: z.number().int().nonnegative(),
})

export const starsResponseSchema = z.object({
  stars: z.number().int().nonnegative().nullable(),
})

export function parseStarCount(payload: unknown): number | null {
  const result = repoStatsSchema.safeParse(payload)
  if (!result.success) return null
  return result.data.stargazers_count
}

export function formatStarCount(count: number): string {
  if (count < 1000) return String(count)
  const thousands = count / 1000
  const rounded = Math.floor(thousands * 10) / 10
  return `${rounded}k`
}
