import {stripVTControlCharacters} from 'node:util'
import {z} from 'zod'

export type EnvelopeError = {
  kind: 'user' | 'unexpected'
  message: string
  hint?: string
  code?: string
  stack?: string
}

const BUG_HINT = 'this looks like a bug — please report it at https://github.com/conciv-dev/conciv/issues'

const TaggedSchema = z.object({
  concivFailure: z.object({
    kind: z.literal('user'),
    message: z.string(),
    hint: z.string().optional(),
    code: z.string().optional(),
  }),
})

const ThrownSchema = z.object({name: z.string().optional(), message: z.string(), stack: z.string().optional()})

export function userFailure(message: string, extra: {hint?: string; code?: string} = {}): Error {
  return Object.assign(new Error(message), {concivFailure: {kind: 'user', message, ...extra}})
}

export function failureOf(error: unknown): EnvelopeError {
  const tagged = TaggedSchema.safeParse(error)
  if (tagged.success) return tagged.data.concivFailure
  const thrown = ThrownSchema.safeParse(error)
  if (!thrown.success) return {kind: 'unexpected', message: String(error), hint: BUG_HINT}
  if (thrown.data.name === 'CLIError') return argumentFailure(thrown.data.message)
  return {kind: 'unexpected', message: thrown.data.message, hint: BUG_HINT, stack: thrown.data.stack}
}

function argumentFailure(message: string): EnvelopeError {
  return {
    kind: 'user',
    message: stripVTControlCharacters(message),
    hint: 'run the command with --help to see the arguments it accepts',
  }
}
