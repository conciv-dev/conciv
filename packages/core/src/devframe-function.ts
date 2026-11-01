import {defineRpcFunction} from 'devframe'
import type {DevframeRpcServerFunctions as RootViewFunctions} from 'devframe'
import type {DevframeNodeContext, DevframeRpcServerFunctions as TypesViewFunctions} from 'devframe/types'
import type {DevframeRpcClient} from 'devframe/client'
import type {BirpcReturn, RpcFunctionAgentOptions, STRUCTURED_CLONE_PREFIX} from 'devframe/rpc'
import {structuredCloneParse} from 'devframe/utils/structured-clone'
import {z} from 'zod'

const WireErrorSchema = z.object({
  concivError: z.literal(true),
  code: z.string(),
  message: z.string(),
  data: z.unknown(),
})

const ErrorEnvelopeSchema = z.object({t: z.literal('s'), i: z.string(), e: WireErrorSchema})

const CodedSchema = z.object({code: z.string(), message: z.string(), data: z.unknown().optional()})

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

const structuredClonePrefix: typeof STRUCTURED_CLONE_PREFIX = 's:'

function decodeFrame(raw: string): unknown {
  if (raw.startsWith(structuredClonePrefix)) return structuredCloneParse(raw.slice(structuredClonePrefix.length))
  return JSON.parse(raw)
}

export function concivRpcOptions(): {deserialize: (raw: string) => unknown} {
  return {
    deserialize: (raw) => {
      const message = decodeFrame(raw)
      const envelope = ErrorEnvelopeSchema.safeParse(message)
      if (!envelope.success) return message
      return {t: envelope.data.t, i: envelope.data.i, e: fromWireError(envelope.data.e)}
    },
  }
}

type ConcivFunctionSpec<
  NAME extends string,
  TYPE extends 'query' | 'action',
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
> = {
  name: NAME
  type: TYPE
  input: INPUT
  output: OUTPUT
  agent?: RpcFunctionAgentOptions
  handler: (input: z.output<INPUT>, context: DevframeNodeContext) => Promise<z.input<OUTPUT>> | z.input<OUTPUT>
}

export function defineConcivFunction<
  NAME extends string,
  TYPE extends 'query' | 'action',
  INPUT extends z.ZodType,
  OUTPUT extends z.ZodType,
>(spec: ConcivFunctionSpec<NAME, TYPE, INPUT, OUTPUT>) {
  const wideInput: z.ZodType = spec.input
  const wideOutput: z.ZodType = spec.output
  const definition = defineRpcFunction({
    name: spec.name,
    type: spec.type,
    jsonSerializable: true,
    ...(spec.agent ? {agent: spec.agent} : {}),
    args: [wideInput],
    returns: wideOutput,
    setup: (context) => ({
      handler: async (raw: unknown): Promise<unknown> => {
        try {
          return await spec.handler(spec.input.parse(raw), context)
        } catch (error) {
          throw toWireError(error)
        }
      },
    }),
  })
  const args: readonly [INPUT] = [spec.input]
  return {...definition, args, returns: spec.output}
}

export type ConcivServerFunctions = TypesViewFunctions & RootViewFunctions

export type ConcivCall = BirpcReturn<ConcivServerFunctions, object>['$call']

export function concivCall(client: DevframeRpcClient): ConcivCall {
  return client.call
}
