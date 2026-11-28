import {gitConfig} from '@/lib/shared'
import {parseStarCount} from '@/lib/star-count'

const STAR_COUNT_CACHE_SECONDS = 600

async function fetchRepo(request: Request): Promise<Response> {
  const cache = await caches.open('star-count')
  const cached = await cache.match(request)
  if (cached !== undefined) return cached
  const response = await fetch(request)
  if (!response.ok) return response
  const body = await response.text()
  const headers = {'content-type': 'application/json', 'cache-control': `max-age=${STAR_COUNT_CACHE_SECONDS}`}
  await cache.put(request, new Response(body, {headers}))
  return new Response(body, {headers})
}

export async function fetchStarCount(): Promise<number | null> {
  try {
    const response = await fetchRepo(
      new Request(`https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}`, {
        headers: {accept: 'application/vnd.github+json', 'user-agent': 'conciv-site'},
      }),
    )
    if (!response.ok) return null
    const payload: unknown = await response.json()
    return parseStarCount(payload)
  } catch {
    return null
  }
}
