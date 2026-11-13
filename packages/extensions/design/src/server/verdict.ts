import type {Design, DesignNode, Round, Status} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
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
      progress: null,
    }
  }
  const shown = {
    round: last.round,
    rows: last.rows,
    counts: last.counts,
    coverage: last.coverage,
    progress: last.progress,
  }
  if (last.broken !== null)
    return {verdict: 'broken', reasons: [last.broken, BROKEN_RULES[last.brokenBy ?? 'compile']], ...shown}
  if (last.unsettled !== null) {
    const {rendered, nodes} = last.coverage
    const told = `the page renders ${rendered} of ${nodes} nodes; the missing ones are listed in coverage.missing`
    return {verdict: 'unsettled', reasons: [last.unsettled, told], ...shown}
  }
  const reasons = reasonsOf({round: last, required: requiredOf(input.design.root)})
  if (reasons.length === 0) return {verdict: 'done', reasons, ...shown}
  return {
    verdict: stalled(rounds.filter((round) => round.unsettled === null && round.broken === null))
      ? 'stalled'
      : 'not yet',
    reasons,
    ...shown,
  }
}

const STALL_ROUNDS = 2

const BROKEN_RULES = {
  compile: 'fix the compile error first; nothing else was measured',
  runtime: 'fix the runtime error first; nothing else was measured',
} as const satisfies Record<NonNullable<Round['brokenBy']>, string>

function requiredOf(root: DesignNode): Map<string, string> {
  return new Map(
    [...walk(root)].flatMap(({node, parent}) => {
      const box = node.figma?.box ?? node.box
      const decoration = node.gate?.kind === 'decoration'
      const line = node.gate?.kind === 'line'
      return decoration || (!line && (box.w <= 0 || box.h <= 0)) ? [] : [[node.id, placed({node, parent})] as const]
    }),
  )
}

function placed(input: {node: DesignNode; parent: DesignNode | null}): string {
  const {node, parent} = input
  const own = `${node.id} ${nameOf(node)}${node.implied === true ? BUILD_IMPLIED : ''}`
  return parent === null ? own : `${own} under ${parent.id} ${nameOf(parent)}`
}

function nameOf(node: DesignNode): string {
  if (node.implied === true) return IMPLIED
  const name = node.figma?.name ?? node.kind
  return node.kind === 'text' ? `${name} "${node.text}"` : name
}

function reasonsOf(input: {round: Round; required: Map<string, string>}): string[] {
  const {round, required} = input
  const {much, noticeably, pins, other} = round.counts
  const missing = round.coverage.missing.flatMap((node) => {
    const label = required.get(node)
    return label === undefined ? [] : [label]
  })
  const reflow = round.rows.filter((row) => row.magnitude === 'reflow')
  const paint = round.rows.filter((row) => row.magnitude === 'paint' && row.kind !== UNBLOCKING)
  const named = round.rows.filter((row) => row.magnitude === 'component')
  return [
    ...round.rows.filter((row) => row.kind === designConfig.rowKinds.page).map((row) => `${row.text}.`),
    ...(much + noticeably + pins + other > 0
      ? [
          `${much} rows differ much, ${noticeably} noticeably, ${pins} pin a px size and ${other} differ otherwise; all four must be 0.`,
        ]
      : []),
    ...(paint.length > 0
      ? [
          `${paint.length} paint rows are left (fill, text color, font, line height, radius, border or opacity unlike the design); all must be 0, font family rows only report.`,
        ]
      : []),
    ...(named.length > 0
      ? [
          `${named.length} component rows are left: ${named
            .slice(0, MISSING_SHOWN)
            .map((row) => `${row.node} is ${row.component ?? ''}`)
            .join(', ')}; render each with its component.`,
        ]
      : []),
    ...(missing.length > 0
      ? [`${missing.length} required nodes are not rendered: ${missing.slice(0, MISSING_SHOWN).join('; ')}.`]
      : []),
    ...(reflow.some((row) => row.width === undefined) ? [WRAP_RULE] : []),
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

const WRAP_RULE =
  'When a text wraps to more lines than the frame, tighten its letter-spacing until it breaks where the frame breaks; never shrink the font.'

const IMPLIED = 'implied group'

const BUILD_IMPLIED = ' (build it as a container)'

const UNBLOCKING = 'font family'

function stalled(rounds: Round[]): boolean {
  const recent = rounds.slice(-(STALL_ROUNDS + 1)).map((round) => round.counts)
  const [first] = recent
  return (
    first !== undefined &&
    first.much > 0 &&
    recent.length === STALL_ROUNDS + 1 &&
    recent.every((counts, index) => {
      const before = recent[index - 1]
      return before === undefined || (counts.much >= before.much && counts.rows >= before.rows)
    })
  )
}
