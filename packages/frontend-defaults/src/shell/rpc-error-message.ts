import {isReachabilityError} from '@conciv/client'
import {EvlogError} from 'evlog'
import {z} from 'zod'

export const SESSION_NOT_FOUND_MESSAGE = 'This session no longer exists.'

const CodedErrorSchema = z.object({code: z.string()})

export type RpcErrorClassification = {
  message: string
  fix: string | undefined
  transportFailure: boolean
}

export function errorFix(error: unknown): string | undefined {
  return EvlogError.isEvlogError(error) ? error.fix : undefined
}

export function classifyRpcError(
  error: unknown,
  transportMessage: string,
  genericMessage: string,
): RpcErrorClassification {
  const transportFailure = isReachabilityError(error)
  if (transportFailure) return {message: transportMessage, fix: undefined, transportFailure}
  const message = error instanceof Error && error.message.length > 0 ? error.message : genericMessage
  return {message, fix: errorFix(error), transportFailure}
}

export function rpcErrorCode(error: unknown): string | null {
  return CodedErrorSchema.safeParse(error).data?.code ?? null
}
