import {description, name, toggle} from '@bomb.sh/router'
import {failureOf, type EnvelopeError} from './failure.js'

export type CliOutcome = {report: 'json'; data: unknown} | {report: 'none'; code: number}

export const envelopeFlag = toggle(name('json'), description('print one JSON envelope (always on for this command)'))

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
