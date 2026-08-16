import {z} from 'zod'
import {gitConfig} from '@/lib/shared'
import {parseStarCount} from '@/lib/star-count'

const UPSTREAM_URL = `https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}`
const UPSTREAM_CACHE_NAME = 'github-stars'
const UPSTREAM_CACHE_KEY = 'https://conciv.dev/api/stars/upstream'
const FRESH_FOR_MS = 60 * 60 * 1000
const KEEP_FOR_SECONDS = 7 * 24 * 60 * 60

const cachedStarsSchema = z.object({stars: z.number().int().nonnegative(), fetchedAt: z.number()})

type CachedStars = z.infer<typeof cachedStarsSchema>

async function readCachedStars(): Promise<CachedStars | null> {
  const cache = await caches.open(UPSTREAM_CACHE_NAME)
  const cached = await cache.match(UPSTREAM_CACHE_KEY)
  if (!cached) return null
  const result = cachedStarsSchema.safeParse(await cached.json())
  return result.success ? result.data : null
}

async function writeCachedStars(stars: number): Promise<void> {
  const body: CachedStars = {stars, fetchedAt: Date.now()}
  const cache = await caches.open(UPSTREAM_CACHE_NAME)
  await cache.put(
    UPSTREAM_CACHE_KEY,
    Response.json(body, {headers: {'cache-control': `public, max-age=${KEEP_FOR_SECONDS}`}}),
  )
}

function upstreamHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'conciv-site',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

async function fetchStarCount(): Promise<number | null> {
  try {
    const response = await fetch(UPSTREAM_URL, {headers: upstreamHeaders()})
    if (!response.ok) return null
    const payload: unknown = await response.json()
    return parseStarCount(payload)
  } catch {
    return null
  }
}

const isFresh = (cached: CachedStars | null): cached is CachedStars =>
  cached !== null && Date.now() - cached.fetchedAt < FRESH_FOR_MS

async function refreshStarCount(stale: CachedStars | null): Promise<number | null> {
  const stars = await fetchStarCount()
  if (stars === null) return stale === null ? null : stale.stars
  await writeCachedStars(stars)
  return stars
}

export async function resolveStarCount(): Promise<number | null> {
  const cached = await readCachedStars()
  return isFresh(cached) ? cached.stars : refreshStarCount(cached)
}
