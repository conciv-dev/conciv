import {z} from 'zod'
import type {EvlogError} from 'evlog'
import {cliErrors} from '@conciv/errors'
import {isCatalogError} from '@conciv/protocol'

export type EnvelopeError = {
  kind: 'user' | 'unexpected'
  message: string
  hint?: string
  code?: string
  type?: string
  data?: unknown
  stack?: string
}

const BUG_HINT = 'this looks like a bug: please report it at https://github.com/conciv-dev/conciv/issues'

const RpcFieldsSchema = z.object({code: z.string(), type: z.string().optional(), data: z.unknown().optional()})

const ThrownSchema = z.object({message: z.string(), stack: z.string().optional()})

function userEnvelope(error: EvlogError): EnvelopeError {
  const rpc = RpcFieldsSchema.safeParse(error.internal)
  return {
    kind: 'user',
    message: error.message,
    ...(error.fix === undefined ? {} : {hint: error.fix}),
    ...(rpc.success ? rpc.data : {}),
  }
}

export function readFailure(error: unknown): EnvelopeError {
  if (isCatalogError(cliErrors._prefix, error) && error.status < 500) return userEnvelope(error)
  const thrown = ThrownSchema.safeParse(error)
  if (!thrown.success) return {kind: 'unexpected', message: String(error), hint: BUG_HINT}
  return {kind: 'unexpected', message: thrown.data.message, hint: BUG_HINT, stack: thrown.data.stack}
}
