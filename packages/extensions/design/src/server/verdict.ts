import type {Design, Round, Verdict} from '../shared/defs.js'

export function verdictOf(input: {design: Design; rounds: Round[]}): Verdict {
  const last = input.rounds.at(-1)
  return {
    verdict: 'not yet',
    reasons: [],
    counts: last?.counts ?? null,
    coverage: last?.coverage ?? null,
    reflow: last?.reflow ?? [],
    pixels: last?.pixels ?? null,
    rounds: input.rounds.length,
  }
}
