import {starsResponseSchema} from './star-count'

let stars: number | null = null
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

async function loadStarCount(): Promise<void> {
  try {
    stars = await parseStarsResponse(await fetch('/api/stars'))
  } catch {
    stars = null
  }
  notify()
}

export function subscribeStarCount(onChange: () => void): () => void {
  listeners.add(onChange)
  if (!started) {
    started = true
    void loadStarCount()
  }
  return () => listeners.delete(onChange)
}

export function getStarCountSnapshot(): number | null {
  return stars
}

export function getServerStarCountSnapshot(): number | null {
  return null
}
