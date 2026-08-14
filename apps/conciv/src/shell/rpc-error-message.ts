import {isReachabilityError} from '@conciv/client'

export type RpcErrorClassification = {
  message: string
  transportFailure: boolean
}

export function classifyRpcError(
  error: unknown,
  transportMessage: string,
  genericMessage: string,
): RpcErrorClassification {
  const transportFailure = isReachabilityError(error)
  if (transportFailure) return {message: transportMessage, transportFailure}
  const message = error instanceof Error && error.message.length > 0 ? error.message : genericMessage
  return {message, transportFailure}
}
