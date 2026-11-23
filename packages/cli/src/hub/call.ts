import {z} from 'zod'
import {Effect, Result} from 'effect'
import {ORPCError} from '@orpc/client'
import {engineTooOld, type CodeReply} from '@conciv/contract'
import {errorText, TOO_OLD} from '../engine-read.js'

export type CallPath = 'runner' | 'tab'

export type CallState =
  | {status: 'sent'; path: CallPath; resent: boolean}
  | {status: 'checking'}
  | {status: 'answered'}
  | {status: 'failed'}

export type CallEvent = {type: 'rejected'; error: unknown} | {type: 'checked'; open: boolean}

export type CallEffect = 'drop' | 'resend' | 'check'

export type CallTransition = {state: CallState; effects: CallEffect[]}

export type Route<Target extends {root: string}> = {
  target: Effect.Effect<Target, unknown>
  drop: (target: Target) => Effect.Effect<void>
  failure: (target: Target, error: unknown) => Effect.Effect<Error>
} & ({path: 'runner'} | {path: 'tab'; holds: (target: Target) => Effect.Effect<boolean>})

export type Sent<Value, Target> = {target: Target} & ({value: Value; reply: null} | {value: null; reply: CodeReply})

const RefusedSchema = z.object({cause: z.object({code: z.literal('ECONNREFUSED')})})

export function transitionCall(state: CallState, event: CallEvent): CallTransition {
  if (state.status === 'sent' && event.type === 'rejected') {
    if (!state.resent && unrun(event.error)) return {state: {...state, resent: true}, effects: ['drop', 'resend']}
    if (!answered(event.error)) return {state: {status: 'failed'}, effects: ['drop']}
    if (state.path === 'runner') return {state: {status: 'answered'}, effects: []}
    return {state: {status: 'checking'}, effects: ['check']}
  }
  if (state.status === 'checking' && event.type === 'checked') {
    return {state: {status: 'answered'}, effects: event.open ? [] : ['drop']}
  }
  return {state, effects: []}
}

function unrun(error: unknown): boolean {
  return RefusedSchema.safeParse(error).success || (error instanceof ORPCError && error.code === 'UNAUTHORIZED')
}

function answered(error: unknown): boolean {
  return error instanceof ORPCError || engineTooOld(error)
}

export function failed(text: string): CodeReply {
  return {content: [{type: 'text', text}], isError: true}
}

export function sendCall<Target extends {root: string}, Value>(
  route: Route<Target>,
  call: (target: Target, signal: AbortSignal) => Promise<Value>,
): Effect.Effect<Sent<Value, Target>, unknown> {
  return sendFrom(route, call, {status: 'sent', path: route.path, resent: false})
}

function sendFrom<Target extends {root: string}, Value>(
  route: Route<Target>,
  call: (target: Target, signal: AbortSignal) => Promise<Value>,
  state: CallState,
): Effect.Effect<Sent<Value, Target>, unknown> {
  return Effect.gen(function* () {
    const target = yield* route.target
    const sent = yield* Effect.result(
      Effect.tryPromise({try: (signal) => call(target, signal), catch: (error) => error}),
    )
    if (Result.isSuccess(sent)) return {target, value: sent.success, reply: null}
    const error = sent.failure
    const rejected = transitionCall(state, {type: 'rejected', error})
    if (rejected.effects.includes('drop')) yield* route.drop(target)
    if (rejected.effects.includes('resend')) return yield* sendFrom(route, call, rejected.state)
    if (rejected.state.status === 'failed') return yield* Effect.fail(yield* route.failure(target, error))
    if (rejected.effects.includes('check') && route.path === 'tab') {
      const checked = transitionCall(rejected.state, {type: 'checked', open: yield* route.holds(target)})
      if (checked.effects.includes('drop')) yield* route.drop(target)
    }
    return {target, value: null, reply: failed(answerText(target.root, error))}
  })
}

function answerText(root: string, error: unknown): string {
  return engineTooOld(error) ? `${root} (${TOO_OLD})` : errorText(error)
}
