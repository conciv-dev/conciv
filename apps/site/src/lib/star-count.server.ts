import {waitUntil} from 'cloudflare:workers'
import {createBlobStorage, defineCachedFunction} from 'ocache'
import {gitConfig} from '@/lib/shared'
import {parseStarCount} from '@/lib/star-count'

async function fetchStarCount(): Promise<number | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}`, {
      headers: {accept: 'application/vnd.github+json', 'user-agent': 'conciv-site'},
    })
    if (!response.ok) return null
    const payload: unknown = await response.json()
    return parseStarCount(payload)
  } catch {
    return null
  }
}

function cacheUrl(key: string): string {
  return `https://ocache.conciv.dev/${encodeURIComponent(key)}`
}

function workersCacheStorage() {
  return createBlobStorage({
    async get(key) {
      const cache = await caches.open('ocache')
      const hit = await cache.match(cacheUrl(key))
      return hit === undefined ? null : await hit.arrayBuffer()
    },
    async set(key, value, opts) {
      const cache = await caches.open('ocache')
      if (value === null) {
        await cache.delete(cacheUrl(key))
        return
      }
      const headers = {'cache-control': `max-age=${opts?.ttl ?? 0}`}
      await cache.put(cacheUrl(key), new Response(new Uint8Array(value), {headers}))
    },
  })
}

export function readStarCount(): Promise<number | null> {
  const cachedStarCount = defineCachedFunction(fetchStarCount, {
    name: 'github-stars',
    maxAge: 600,
    swr: true,
    staleMaxAge: 86_400,
    storage: workersCacheStorage,
    waitUntil,
    validate: (entry) => entry.value !== null,
  })
  return cachedStarCount()
}
