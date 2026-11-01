import {defineRpcFunction} from 'devframe'
import type {DevframeRpcServerFunctions as RootViewFunctions} from 'devframe'
import type {DevframeRpcClient} from 'devframe/client'
import type {BirpcReturn, RpcFunctionAgentOptions} from 'devframe/rpc'
import type {DevframeNodeContext, DevframeRpcServerFunctions as TypesViewFunctions} from 'devframe/types'
import {structuredCloneParse} from 'devframe/utils/structured-clone'
import {SessionId} from '@conciv/protocol/chat-types'
import {z} from 'zod'
import {CONCIV_HOST_SERVICE} from './devframe-host.js'

const STRUCTURED_CLONE_FRAME_PREFIX = 's:'

const WireErrorSchema = z.object({
  concivError: z.literal(true),
  code: z.string(),
  message: z.string(),
  data: z.unknown(),
})

const ErrorEnvelopeSchema = z.object({t: z.literal('s'), i: z.string(), e: WireErrorSchema})

const INVALID_ARGUMENT = /^RPC function "[^"]+" received an invalid argument at position \d+: /

const InvalidArgumentEnvelopeSchema = z.object({
  t: z.literal('s'),
  i: z.string(),
  e: z.instanceof(Error).refine((error) => INVALID_ARGUMENT.test(error.message)),
})

const CodedSchema = z.object({code: z.string(), message: z.string(), data: z.unknown().optional()})

const SessionInput = z.object({sessionId: SessionId.optional()})

type WireError = z.infer<typeof WireErrorSchema>

export type ConcivError = Error & {code: string; data: unknown}

export function concivError(code: string, message: string, data?: unknown): ConcivError {
  return Object.assign(new Error(message), {name: 'ConcivError', code, data: data ?? null})
}

function toWireError(error: unknown): WireError {
  const coded = CodedSchema.safeParse(error)
  if (coded.success)
    return {concivError: true, code: coded.data.code, message: coded.data.message, data: coded.data.data ?? null}
  const message = error instanceof Error ? error.message : String(error)
  return {concivError: true, code: 'CONCIV_INTERNAL', message, data: null}
}

export function fromWireError(error: unknown): unknown {
  const wire = WireErrorSchema.safeParse(error)
  if (!wire.success) return error
  return concivError(wire.data.code, wire.data.message, wire.data.data)
}

function decodeFrame(raw: string): unknown {
  if (raw.startsWith(STRUCTURED_CLONE_FRAME_PREFIX))
    return structuredCloneParse(raw.slice(STRUCTURED_CLONE_FRAME_PREFIX.length))
  return JSON.parse(raw)
}

export function concivRpcOptions(): {deserialize: (raw: string) => unknown} {
  return {
    deserialize: (raw) => {
      const message = decodeFrame(raw)
      const envelope = ErrorEnvelopeSchema.safeParse(message)
      if (envelope.success) return {t: envelope.data.t, i: envelope.data.i, e: fromWireError(envelope.data.e)}
      const invalid = InvalidArgumentEnvelopeSchema.safeParse(message)
      if (!invalid.success) return message
      return {t: invalid.data.t, i: invalid.data.i, e: concivError('BAD_REQUEST', invalid.data.e.message)}
    },
  }
}

type ConcivFunctionKind = 'query' | 'action'

type FunctionBase<
  NAME extends string,
  TYPE extends ConcivFunctionKind,
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
> = {
  name: NAME
  type: TYPE
  input: INPUT
  output: OUTPUT
  agent?: RpcFunctionAgentOptions
}

type PlainSpec<
  NAME extends string,
  TYPE extends ConcivFunctionKind,
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
> = FunctionBase<NAME, TYPE, INPUT, OUTPUT> & {
  session?: false
  handler: (input: z.output<INPUT>, call: {ctx: DevframeNodeContext}) => Promise<z.input<OUTPUT>> | z.input<OUTPUT>
}

type SessionSpec<
  NAME extends string,
  TYPE extends ConcivFunctionKind,
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
> = FunctionBase<NAME, TYPE, INPUT, OUTPUT> & {
  session: true
  handler: (
    input: z.output<INPUT>,
    call: {ctx: DevframeNodeContext; sessionId: SessionId},
  ) => Promise<z.input<OUTPUT>> | z.input<OUTPUT>
}

type WideSpec =
  | PlainSpec<string, ConcivFunctionKind, z.ZodType, z.ZodType>
  | SessionSpec<string, ConcivFunctionKind, z.ZodType, z.ZodType>

type ConcivFunction<
  NAME extends string,
  TYPE extends ConcivFunctionKind,
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
> = {
  name: NAME
  type: TYPE
  args: readonly [INPUT]
  returns: OUTPUT
  jsonSerializable: true
  agent?: RpcFunctionAgentOptions
}

function runHandler(spec: WideSpec, raw: unknown, ctx: DevframeNodeContext): unknown {
  const input = spec.input.parse(raw)
  if (spec.session !== true) return spec.handler(input, {ctx})
  const host = ctx.services.get(CONCIV_HOST_SERVICE)
  if (!host) throw concivError('NO_SESSION', `${spec.name} needs the conciv:host service`)
  return host.inSession(SessionInput.parse(raw).sessionId, (sessionId) => spec.handler(input, {ctx, sessionId}))
}

export function defineConcivFunction<
  NAME extends string,
  TYPE extends ConcivFunctionKind,
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
>(
  spec: SessionSpec<NAME, TYPE, INPUT, OUTPUT>,
): ConcivFunction<NAME, TYPE, z.ZodIntersection<INPUT, typeof SessionInput>, OUTPUT>
export function defineConcivFunction<
  NAME extends string,
  TYPE extends ConcivFunctionKind,
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
>(spec: PlainSpec<NAME, TYPE, INPUT, OUTPUT>): ConcivFunction<NAME, TYPE, INPUT, OUTPUT>
export function defineConcivFunction(spec: WideSpec): unknown {
  const wireInput: z.ZodType = spec.session === true ? z.intersection(spec.input, SessionInput) : spec.input
  return defineRpcFunction({
    name: spec.name,
    type: spec.type,
    jsonSerializable: true,
    ...(spec.agent ? {agent: spec.agent} : {}),
    args: [wireInput],
    returns: spec.output,
    setup: (ctx) => ({
      handler: async (raw: unknown): Promise<unknown> => {
        try {
          return await runHandler(spec, raw, ctx)
        } catch (error) {
          throw toWireError(error)
        }
      },
    }),
  })
}

export type ConcivServerFunctions = TypesViewFunctions & RootViewFunctions

export type ConcivCall = BirpcReturn<ConcivServerFunctions, object>['$call']

export function concivCall(client: DevframeRpcClient): ConcivCall {
  return client.call
}
