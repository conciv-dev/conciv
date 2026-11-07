import {description, extend, name, route} from '@bomb.sh/router'
import type {RpcClient} from '@conciv/contract'
import {BUILTIN_SERVER_TOOLS, serverOperationOfTool} from '@conciv/tools/builtins'
import {envelopeFlag} from './envelope.js'
import {runRpc} from './request.js'
import {toolCommand} from './tool-command.js'

type OperationCall = (input: unknown) => Promise<unknown>

function isOperationCall(value: unknown): value is OperationCall {
  return typeof value === 'function'
}

function callOperation(rpc: RpcClient, operation: string, input: Record<string, unknown>): Promise<unknown> {
  const call: unknown = Reflect.get(rpc.server, operation)
  if (!isOperationCall(call)) throw new Error(`the server does not implement "${operation}"`)
  return call(input)
}

function operationCommands() {
  return BUILTIN_SERVER_TOOLS.map((tool) => {
    const operation = serverOperationOfTool(tool.name)
    return toolCommand(tool, {
      name: operation,
      positional: tool.meta?.positional,
      run: (input) => runRpc((rpc) => callOperation(rpc, operation, input)),
    })
  })
}

export const serverRoute = route(
  name('server'),
  description('inspect & nudge the live dev server'),
  envelopeFlag,
  extend(...operationCommands()),
)
