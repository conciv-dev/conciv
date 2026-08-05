import {diffChars} from 'diff'

const MAX_DISTANCE = 3

export function comparisonKey(name: string): string {
  const [head] = name.replace(/^-+/, '').split('=')
  return (head ?? '').replaceAll('-', '').toLowerCase()
}

function distance(one: string, other: string): number {
  return diffChars(one, other)
    .filter((part) => part.added === true || part.removed === true)
    .reduce((total, part) => total + part.value.length, 0)
}

export function closest(typed: string, candidates: string[]): string | null {
  const key = comparisonKey(typed)
  const ranked = candidates
    .map((candidate) => ({candidate, score: distance(key, comparisonKey(candidate))}))
    .toSorted((one, other) => one.score - other.score)
  const best = ranked[0]
  if (best === undefined || best.score > MAX_DISTANCE) return null
  return best.candidate
}
