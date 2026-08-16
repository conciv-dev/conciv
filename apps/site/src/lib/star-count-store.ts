import {starsResponseSchema} from './star-count'

let refreshed: number | null = null
let started = false
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

async function parseStarsResponse(response: Response): Promise<number | null> {
  if (!response.ok) return null
  const result = starsResponseSchema.safeParse(await response.json())
  return result.success ? result.data.stars : null
}

async function fetchRefreshedStarCount(): Promise<number | null> {
  try {
    return await parseStarsResponse(await fetch('/api/stars'))
  } catch {
    return null
  }
}

async function refreshStarCount(): Promise<void> {
  const stars = await fetchRefreshedStarCount()
  if (stars === null) return
  refreshed = stars
  notify()
}

export function subscribeStarCount(onChange: () => void): () => void {
  listeners.add(onChange)
  if (!started) {
    started = true
    void refreshStarCount()
  }
  return () => listeners.delete(onChange)
}

export function getRefreshedStarCount(): number | null {
  return refreshed
}

export function getServerRefreshedStarCount(): number | null {
  return null
}
