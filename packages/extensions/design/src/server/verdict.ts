import type {Design, DesignNode, Round, Status} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function verdictOf(input: {design: Design; rounds: Round[]}): Status {
  const {rounds} = input
  const last = rounds.at(-1)
  if (last === undefined) {
    return {
      verdict: 'not yet',
      reasons: ['No round yet: call design_check first.'],
      round: 0,
      rows: [],
      counts: null,
      coverage: null,
    }
  }
  const reasons = reasonsOf({round: last, required: requiredOf(input.design.root)})
  const shown = {round: last.round, rows: last.rows, counts: last.counts, coverage: last.coverage}
  if (reasons.length === 0) return {verdict: 'done', reasons, ...shown}
  return {verdict: stalled(rounds) ? 'stalled' : 'not yet', reasons, ...shown}
}

const STALL_ROUNDS = 2

function requiredOf(root: DesignNode): Set<string> {
  return new Set(
    [...walk(root)].flatMap(({node}) => {
      const box = node.figma?.box ?? node.box
      const decoration = node.gate?.kind === 'decoration'
      return decoration || box.w <= 0 || box.h <= 0 ? [] : [node.id]
    }),
  )
}

function reasonsOf(input: {round: Round; required: Set<string>}): string[] {
  const {round, required} = input
  const {much, noticeably, pins, other} = round.counts
  const missing = round.coverage.missing.filter((node) => required.has(node))
  const reflow = round.rows.filter((row) => row.magnitude === 'reflow')
  return [
    ...(much + noticeably + pins + other > 0
      ? [
          `${much} rows differ much, ${noticeably} noticeably, ${pins} pin a px size and ${other} differ otherwise; all four must be 0.`,
        ]
      : []),
    ...(missing.length > 0
      ? [`${missing.length} required nodes are not rendered: ${missing.slice(0, MISSING_SHOWN).join(', ')}.`]
      : []),
    ...(reflow.length > 0
      ? [
          `${reflow.length} reflow rows are left: ${reflow
            .slice(0, MISSING_SHOWN)
            .map((row) => `${row.node} at ${row.width ?? 'the design width'} wide`)
            .join(', ')}.`,
        ]
      : []),
  ]
}

const MISSING_SHOWN = 10

function stalled(rounds: Round[]): boolean {
  const recent = rounds.slice(-(STALL_ROUNDS + 1)).map((round) => round.counts.much)
  const [first = 0] = recent
  return (
    first > 0 &&
    recent.length === STALL_ROUNDS + 1 &&
    recent.every((much, index) => index === 0 || much >= (recent[index - 1] ?? much))
  )
}
