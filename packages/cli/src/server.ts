import type {RpcClient, ToolCommandSignature} from '@conciv/contract'
import type {CliOutcome} from './envelope.js'
import {runRpc, type CliTarget} from './request.js'

type OperationCall = (input: unknown) => Promise<unknown>

export function callServerOperation(
  signature: ToolCommandSignature,
  input: Record<string, unknown>,
  target: CliTarget,
): Promise<CliOutcome> {
  const operation = signature.name.slice(signature.name.indexOf('_') + 1)
  return runRpc(target, (rpc) => callOperation(rpc, operation, input))
}

function callOperation(rpc: RpcClient, operation: string, input: Record<string, unknown>): Promise<unknown> {
  const call: unknown = Reflect.get(rpc.server, operation)
  if (!isOperationCall(call)) throw new Error(`the server does not implement "${operation}"`)
  return call(input)
}

function isOperationCall(value: unknown): value is OperationCall {
  return typeof value === 'function'
}
