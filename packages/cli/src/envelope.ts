import {z} from 'zod'
import {failureOf, type EnvelopeError} from './failure.js'

export type CliOutcome = {report: 'json'; data: unknown} | {report: 'none'; code: number}

const OutcomeSchema = z.union([
  z.object({report: z.literal('json'), data: z.unknown()}),
  z.object({report: z.literal('none'), code: z.number()}),
])

export function outcomeOf(result: unknown): CliOutcome {
  const parsed = OutcomeSchema.safeParse(result)
  if (parsed.success) return parsed.data
  throw new Error('the command returned no outcome')
}

export function writeFailure(error: EnvelopeError): number {
  process.stdout.write(`${JSON.stringify({ok: false, error})}\n`)
  return 1
}

export async function writeOutcome(pending: Promise<CliOutcome>): Promise<number> {
  try {
    const outcome = await pending
    if (outcome.report === 'none') return outcome.code
    process.stdout.write(`${JSON.stringify({ok: true, data: outcome.data})}\n`)
    return 0
  } catch (error) {
    return writeFailure(failureOf(error))
  }
}
