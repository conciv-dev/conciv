import type {MessagePort} from 'node:worker_threads'
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/message-port'
import type {RouterClient} from '@orpc/server'
import {createQuickJSIsolateDriver} from '@tanstack/ai-isolate-quickjs'
import type {ExecutionResult, ToolBinding} from '@tanstack/ai-code-mode'
import type {ToolRouter} from './quickjs-thread.js'

type Host = RouterClient<ToolRouter>

export type QuickJSTask = {
  code: string
  names: string[]
  timeout: number
  memoryLimit: number
  maxStackSize: number
  port: MessagePort
}

export default async function runQuickJS(task: QuickJSTask): Promise<ExecutionResult> {
  const host: Host = createORPCClient(new RPCLink({port: task.port}))
  const context = await createQuickJSIsolateDriver(task).createContext({
    bindings: Object.fromEntries(task.names.map((name) => [name, bindingOver(host, name)])),
    timeout: task.timeout,
    memoryLimit: task.memoryLimit,
  })
  return context.execute(task.code).catch((error: unknown) => ({
    success: false,
    error: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    },
    logs: [],
  }))
}

function bindingOver(host: Host, name: string): ToolBinding {
  return {
    name,
    description: name,
    inputSchema: {},
    execute: (args) => host.call({name, args}),
  }
}
