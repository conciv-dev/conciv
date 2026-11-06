import type {Design, DesignNode, Round, Verdict} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function verdictOf(input: {design: Design; rounds: Round[]}): Verdict {
  const {rounds} = input
  const last = rounds.at(-1)
  if (last === undefined) {
    return {
      verdict: 'not yet',
      reasons: ['No measure yet: call design_watch first.'],
      counts: null,
      coverage: null,
      reflow: {widths: [], results: []},
      pixels: null,
      rounds: 0,
    }
  }
  const reasons = reasonsOf({round: last, required: requiredOf(input.design.root)})
  const shown = {
    counts: last.counts,
    coverage: last.coverage,
    reflow: last.reflow,
    pixels: last.pixels,
    rounds: rounds.length,
  }
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
  const {much, noticeably, pins} = round.counts
  const missing = round.coverage.missing.filter((node) => required.has(node))
  return [
    ...(much + noticeably + pins > 0
      ? [`${much} rows differ much, ${noticeably} noticeably and ${pins} pin a px size; all three must be 0.`]
      : []),
    ...(missing.length > 0
      ? [`${missing.length} required nodes are not rendered: ${missing.slice(0, MISSING_SHOWN).join(', ')}.`]
      : []),
    ...round.reflow.results.flatMap((reflow) => [
      ...(reflow.sticksOut.length > 0
        ? [
            `At ${reflow.width} wide ${reflow.sticksOut.length} nodes stick out of the page: ${reflow.sticksOut.slice(0, MISSING_SHOWN).join(', ')}.`,
          ]
        : []),
      ...(reflow.overflowX ? [`At ${reflow.width} wide the page scrolls sideways.`] : []),
      ...reflow.tags
        .filter((tag) => tag.ok !== true)
        .map((tag) => `At ${reflow.width} wide the ${tag.kind} node ${tag.node} fails: ${tag.why}.`),
    ]),
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
