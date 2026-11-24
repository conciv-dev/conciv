import {isReachabilityError} from '@conciv/client'

export const SESSION_NOT_FOUND_MESSAGE = 'This session no longer exists.'

export type RpcErrorClassification = {
  message: string
}

export function classifyRpcError(
  error: unknown,
  transportMessage: string,
  genericMessage: string,
): RpcErrorClassification {
  if (isReachabilityError(error)) return {message: transportMessage}
  return {message: error instanceof Error && error.message.length > 0 ? error.message : genericMessage}
}

export function rpcErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string')
    return error.code
  return null
}
