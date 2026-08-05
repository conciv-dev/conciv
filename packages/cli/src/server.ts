import {defineCommand, type SubCommandsDef} from 'citty'
import type {RpcClient} from '@conciv/contract'
import {BUILTIN_SERVER_TOOLS, serverOperationOfTool} from '@conciv/tools/builtins'
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

function operationCommands(): SubCommandsDef {
  return Object.fromEntries(
    BUILTIN_SERVER_TOOLS.map((tool) => {
      const operation = serverOperationOfTool(tool.name)
      return [
        operation,
        toolCommand(tool, {
          name: operation,
          positional: tool.meta?.positional,
          run: (input) => runRpc((rpc) => callOperation(rpc, operation, input)),
        }),
      ]
    }),
  )
}

export const serverCommand = defineCommand({
  meta: {name: 'server', description: 'inspect & nudge the live dev server'},
  subCommands: operationCommands(),
})
