export function highlightPattern(words: readonly string[]): RegExp | null {
  const alternatives = words
    .filter((word) => word !== '')
    .toSorted((first, second) => second.length - first.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (alternatives.length === 0) return null
  return new RegExp(`(?<![\\p{L}\\p{N}_])(${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'iu')
}
