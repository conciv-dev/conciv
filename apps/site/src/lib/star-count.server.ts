import {gitConfig} from '@/lib/shared'
import {parseStarCount} from '@/lib/star-count'

export async function fetchStarCount(): Promise<number | null> {
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
