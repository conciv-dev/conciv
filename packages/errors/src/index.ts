import {USER_MESSAGES, type UserCode} from './user-codes.js'

export type {UserCode} from './user-codes.js'
export {USER_MESSAGES} from './user-codes.js'

const concivErrorBrand = Symbol.for('conciv_error')

export type UserDetails = Record<string, unknown>

export type ErrorCategory = 'user' | 'internal' | 'fatal' | 'expected_behavior' | 'custom'

export interface ConcivErrorDetails<UD extends UserDetails = UserDetails> {
  name: string
  message: string
  code: string
  category: string
  userMessage: string
  userCode: UserCode
  statusCode: number
  details: UserDetails
  userDetails?: UD
  causations?: ConcivError[]
}

export interface ConcivError<UD extends UserDetails = UserDetails> extends Error, ConcivErrorDetails<UD> {}

export interface MakeErrorOptions<UD extends UserDetails = UserDetails> {
  message: string
  code: string
  errorName?: string
  category?: ErrorCategory
  customCategory?: string
  userMessage?: string
  userCode: UserCode
  statusCode?: number
  causations?: ConcivError[]
  details?: UserDetails
  userDetails?: UD
}

export function makeError<UD extends UserDetails = UserDetails>(opts: MakeErrorOptions<UD>): ConcivError<UD> {
  const error = new Error(opts.message)
  error.name = opts.errorName ?? 'ConcivError'
  return decorateError({...opts, error})
}

export interface DecorateErrorOptions<UD extends UserDetails = UserDetails> {
  error: Error
  code: string
  category?: ErrorCategory
  customCategory?: string
  userMessage?: string
  userCode: UserCode
  statusCode?: number
  causations?: ConcivError[]
  details?: UserDetails
  userDetails?: UD
}

export function decorateError<UD extends UserDetails = UserDetails>(opts: DecorateErrorOptions<UD>): ConcivError<UD> {
  const category = opts.category ?? 'internal'
  const resolvedCategory = category === 'custom' ? (opts.customCategory ?? 'internal') : category
  return Object.assign(opts.error, {
    code: opts.code,
    category: resolvedCategory,
    userMessage: opts.userMessage ?? USER_MESSAGES[opts.userCode],
    userCode: opts.userCode,
    statusCode: opts.statusCode ?? (resolvedCategory === 'user' ? 400 : 500),
    details: opts.details ?? {},
    userDetails: opts.userDetails,
    causations: opts.causations,
    [concivErrorBrand]: true,
  })
}

export function isConcivError<UD extends UserDetails = UserDetails>(error: unknown): error is ConcivError<UD> {
  return error instanceof Error && Reflect.get(error, concivErrorBrand) === true
}

const INTRINSIC = new Set(['name', 'message', 'stack'])

export function serialize(error: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (!(error instanceof Error)) return error
  if (seen.has(error)) return {name: error.name, message: error.message, circular: true}
  seen.add(error)
  const out: Record<string, unknown> = {name: error.name, message: error.message, stack: error.stack}
  for (const [key, value] of Object.entries(error)) {
    if (INTRINSIC.has(key)) continue
    out[key] = value instanceof Error ? serialize(value, seen) : value
  }
  if (isConcivError(error)) {
    out.causations = error.causations?.map((cause) => serialize(cause, seen))
    out.conciv_error = true
  }
  return out
}

export type ClientErrorPayload = {
  message: string
  code: UserCode
  details?: UserDetails
  internal?: {code: string; category: string; message: string; details: UserDetails; causations?: unknown[]}
}

export function clientPayload(error: ConcivError, dev: boolean): ClientErrorPayload {
  const payload: ClientErrorPayload = {
    message: error.userMessage,
    code: error.userCode,
    ...(error.userDetails ? {details: error.userDetails} : {}),
  }
  return dev
    ? {
        ...payload,
        internal: {
          code: error.code,
          category: error.category,
          message: error.message,
          details: error.details,
          causations: error.causations?.map((cause) => serialize(cause)),
        },
      }
    : payload
}
