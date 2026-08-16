import {starsResponseSchema} from './star-count'

export type StarCountState = {stars: number | null; settled: boolean}

const PENDING: StarCountState = {stars: null, settled: false}
let state: StarCountState = PENDING
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
    state = {stars: await parseStarsResponse(await fetch('/api/stars')), settled: true}
  } catch {
    state = {stars: null, settled: true}
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

export function getStarCountSnapshot(): StarCountState {
  return state
}

export function getServerStarCountSnapshot(): StarCountState {
  return PENDING
}
