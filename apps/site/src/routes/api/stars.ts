import {createFileRoute} from '@tanstack/react-router'
import {gitConfig} from '@/lib/shared'
import {parseStarCount} from '@/lib/star-count'

const SUCCESS_CACHE_CONTROL = 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400'
const FAILURE_CACHE_CONTROL = 'public, max-age=60'

async function fetchStarCount(): Promise<number | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'conciv-site',
      },
    })
    if (!response.ok) return null
    const payload: unknown = await response.json()
    return parseStarCount(payload)
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/stars')({
  server: {
    handlers: {
      GET: async () => {
        const stars = await fetchStarCount()
        return Response.json(
          {stars},
          {
            headers: {
              'cache-control': stars === null ? FAILURE_CACHE_CONTROL : SUCCESS_CACHE_CONTROL,
            },
          },
        )
      },
    },
  },
})
