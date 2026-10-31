import type {Delta, Row} from './data.js'

export function traced(delta: Delta): boolean {
  return delta.via !== undefined && delta.via !== 'unknown' && delta.file !== undefined
}

function where(delta: Delta): string {
  if (delta.line === undefined) return `${delta.file}`
  return `${delta.file}:${delta.line}`
}

function sentence(delta: Delta): string {
  const change = `${delta.kind} is ${delta.live} where the design has ${delta.target}`
  const declared = delta.declaration === undefined ? '' : `, declared as \`${delta.declaration}\``
  const suggestion = delta.suggest === undefined ? '' : `; ${delta.suggest}`
  return `${change}, set via ${delta.via} at ${where(delta)}${declared}${suggestion}`
}

export function fixPrompt(row: Row): string | null {
  const deltas = row.deltas.filter(traced)
  if (deltas.length === 0) return null
  return `Fix ${row.label} (${row.selector}) to match the design: ${deltas.map(sentence).join('. ')}.`
}
