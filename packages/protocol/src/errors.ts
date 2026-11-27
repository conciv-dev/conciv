import {ORPCError} from '@orpc/client'
import type {ErrorMap} from '@orpc/contract'
import {Cause, Effect, Option, Result} from 'effect'
import {mapValues, pick} from 'es-toolkit'
import {EvlogError, type ErrorCatalogMap} from 'evlog'
import {engineErrorEntries, engineErrors} from '@conciv/errors'
import {z} from 'zod'

export const ErrorDetailSchema = z.object({why: z.string().optional(), fix: z.string().optional()})

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>

const PluginRpcPayloadSchema = z.object({type: z.string(), message: z.string(), data: z.unknown().optional()})

export type PluginRpcPayload = z.infer<typeof PluginRpcPayloadSchema>

const PluginRpcDataSchema = ErrorDetailSchema.extend(PluginRpcPayloadSchema.shape)

const PluginRpcInternalDataSchema = PluginRpcDataSchema.extend({type: z.enum(['rpc.internal', 'rpc.invalid_output'])})

const PluginInternalSchema = z.object({plugin: PluginRpcPayloadSchema})

export function failureText(failure: unknown): string {
  return failure instanceof Error ? `${failure.name}: ${failure.message}` : String(failure)
}

export type EngineErrorCode = keyof typeof engineErrorEntries

const DeclaredDetailSchema = ErrorDetailSchema.optional()

type ContractErrorEntry = {readonly message?: string; readonly data: typeof DeclaredDetailSchema}

export function declareErrors<const Entries extends ErrorCatalogMap>(
  entries: Entries,
): Record<keyof Entries, ContractErrorEntry> {
  return mapValues(entries, (entry) =>
    typeof entry.message === 'string'
      ? {message: entry.message, data: DeclaredDetailSchema}
      : {data: DeclaredDetailSchema},
  )
}

export function errorStatuses<const Entries extends ErrorCatalogMap>(entries: Entries): Record<keyof Entries, number> {
  return mapValues(entries, (entry) => entry.status ?? 500)
}

const declaredEngineErrors = {
  ...declareErrors(engineErrorEntries),
  PLUGIN_RPC: {message: engineErrorEntries.PLUGIN_RPC.message, data: PluginRpcDataSchema},
  PLUGIN_RPC_INTERNAL: {message: engineErrorEntries.PLUGIN_RPC_INTERNAL.message, data: PluginRpcInternalDataSchema},
}

export function engineContractErrors<const Code extends EngineErrorCode>(
  ...codes: Code[]
): Pick<typeof declaredEngineErrors, Code> {
  return pick(declaredEngineErrors, codes)
}

export function contractCode(error: {readonly code?: string | undefined}): string {
  const code = error.code ?? ''
  return code.slice(code.indexOf('.') + 1)
}

export function pluginRpcError(payload: PluginRpcPayload): EvlogError {
  if (payload.type === 'rpc.internal' || payload.type === 'rpc.invalid_output')
    return engineErrors.PLUGIN_RPC_INTERNAL({
      message: payload.message,
      internal: {plugin: {type: payload.type, message: payload.message}},
    })
  return engineErrors.PLUGIN_RPC({message: payload.message, internal: {plugin: payload}})
}

function wireData(error: EvlogError): ErrorDetail & Partial<PluginRpcPayload> {
  const detail = {
    ...(error.why === undefined ? {} : {why: error.why}),
    ...(error.fix === undefined ? {} : {fix: error.fix}),
  }
  const plugin = PluginInternalSchema.safeParse(error.internal)
  return plugin.success ? {...plugin.data.plugin, ...detail} : detail
}

export function isCatalogError(prefix: string, failure: unknown): failure is EvlogError {
  return EvlogError.isEvlogError(failure) && failure.code?.startsWith(`${prefix}.`) === true
}

export function contractError(failure: EvlogError, declared: ErrorMap): ORPCError<string, unknown> {
  const code = contractCode(failure)
  if (!Object.hasOwn(declared, code) && failure.status >= 500)
    return new ORPCError('INTERNAL_SERVER_ERROR', {cause: failure})
  return new ORPCError(code, {message: failure.message, data: wireData(failure), cause: failure})
}

function caughtCatalogError(prefix: string, cause: Cause.Cause<unknown>): EvlogError | undefined {
  const failure = Cause.findErrorOption(cause)
  if (Option.isSome(failure)) return isCatalogError(prefix, failure.value) ? failure.value : undefined
  const defect = Cause.findDefect(cause)
  return Result.isSuccess(defect) && isCatalogError(prefix, defect.success) ? defect.success : undefined
}

export function answerCatalogErrors(
  prefix: string,
  declared: ErrorMap,
  record: (failure: EvlogError, answer: ORPCError<string, unknown>) => Effect.Effect<void>,
): <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.Effect<A, unknown, R> {
  return (effect) =>
    effect.pipe(
      Effect.catchCause((cause) => {
        const failure = caughtCatalogError(prefix, cause)
        if (failure === undefined) return Effect.failCause(cause)
        const answer = contractError(failure, declared)
        return record(failure, answer).pipe(Effect.andThen(Effect.fail(answer)))
      }),
    )
}
