import {useQuery} from '@tanstack/react-query'
import {starsResponseSchema} from './star-count'

async function parseStarsResponse(response: Response): Promise<number | null> {
  if (!response.ok) return null
  const result = starsResponseSchema.safeParse(await response.json())
  return result.success ? result.data.stars : null
}

async function loadStarCount(): Promise<number | null> {
  try {
    return await parseStarsResponse(await fetch('/api/stars'))
  } catch {
    return null
  }
}

export function useStarCount(): number | null {
  const {data} = useQuery({queryKey: ['github-stars'], queryFn: loadStarCount, staleTime: Infinity, gcTime: Infinity})
  return data ?? null
}
