export function rankSessionTitle(title: string, query: string): number | undefined {
  if (title.toLowerCase() === query.toLowerCase()) return 0
  const words = query.toLowerCase().split(' ')
  const titleWords = title.toLowerCase().split(/\s+/).filter(Boolean)
  const start = titleWords.findIndex((_, first) =>
    words.every((word, index) => titleWords[first + index]?.startsWith(word)),
  )
  if (start < 0) return undefined
  return start === 0 ? 1 : 2
}
