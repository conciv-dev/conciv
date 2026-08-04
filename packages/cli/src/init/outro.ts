import type {LedgerEntry, ManualCard, StepStatus} from './ledger.js'
import type {InitOutput} from './wizard.js'

const quickStartDocs = 'https://conciv.dev/docs/quick-start'

export function emitOutro(output: InitOutput, entries: LedgerEntry[], next: string[]): void {
  const cards = entries.flatMap((entry) => entry.cards)
  for (const card of cards) output.note({title: card.title, body: cardBody(card)})
  if (cards.length > 0) {
    output.warn(summaryLine(entries))
    output.outro(nextLine([...next, `docs: ${quickStartDocs}`]))
    return
  }
  output.success(summaryLine(entries))
  output.outro(nextLine(next))
}

function cardBody(card: ManualCard): string {
  if (card.snippet === undefined) return card.body
  return `${card.body}\n\n${card.snippet}`
}

function summaryLine(entries: LedgerEntry[]): string {
  const counted = (status: StepStatus) => entries.filter((entry) => entry.status === status).length
  const manual = counted('manual')
  const parts = [
    ...countPart(counted('done'), 'wired'),
    ...countPart(counted('already'), 'already wired'),
    ...countPart(manual, manual === 1 ? 'manual step below' : 'manual steps below'),
    ...countPart(counted('skipped'), 'skipped'),
  ]
  if (parts.length === 0) return 'nothing to do'
  return parts.join(' · ')
}

function countPart(count: number, label: string): string[] {
  if (count === 0) return []
  return [`${count} ${label}`]
}

function nextLine(next: string[]): string {
  if (next.length === 0) return 'conciv init finished.'
  return `Next steps — ${next.join(' · ')}`
}
