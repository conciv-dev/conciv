import {renderCard} from './cards.js'
import type {LedgerEntry, StepStatus} from './pipeline.js'

const statusGlyphs: Record<StepStatus, string> = {done: '✔', already: '✔', manual: '✎', skipped: '○'}
const statusOrder: StepStatus[] = ['done', 'already', 'manual', 'skipped']

export function renderOutro(entries: LedgerEntry[], next: string[]): string {
  const sections = statusOrder.flatMap((status) => statusSection(entries, status))
  const cards = entries.flatMap((entry) => entry.cards.map(renderCard))
  return [...sections, ...cards, ...nextSection(next)].join('\n\n')
}

function statusSection(entries: LedgerEntry[], status: StepStatus): string[] {
  const matched = entries.filter((entry) => entry.status === status)
  if (matched.length === 0) return []
  const lines = matched.map((entry) => `  ${statusGlyphs[status]} ${entry.title}`)
  return [[`${matched.length} ${status}`, ...lines].join('\n')]
}

function nextSection(next: string[]): string[] {
  if (next.length === 0) return []
  return [['Next steps:', ...next.map((line) => `  ${line}`)].join('\n')]
}
