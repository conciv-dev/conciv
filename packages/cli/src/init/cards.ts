import type {ManualCard} from './pipeline.js'

export function renderCard(card: ManualCard): string {
  const inner = [card.title, '', ...card.body.split('\n'), ...snippetLines(card.snippet)]
  const width = inner.reduce((widest, line) => Math.max(widest, line.length), 0)
  const framed = inner.map((line) => `│ ${line.padEnd(width)} │`)
  return [`┌${'─'.repeat(width + 2)}┐`, ...framed, `└${'─'.repeat(width + 2)}┘`].join('\n')
}

function snippetLines(snippet: string | undefined): string[] {
  if (!snippet) return []
  return ['', '```', ...snippet.split('\n'), '```']
}
