import type {MessagePort} from 'node:worker_threads'
import {createBirpc} from 'birpc'
import {z} from 'zod'
import {createQuickJSIsolateDriver} from '@tanstack/ai-isolate-quickjs'
import type {ExecutionResult, ToolBinding} from '@tanstack/ai-code-mode'

type HostCalls = {call: (name: string, args: unknown) => Promise<string>}

type QuickJSTask = {
  code: string
  names: string[]
  timeout: number
  memoryLimit: number
  maxStackSize: number
  port: MessagePort
}

const ResultValueSchema = z.object({value: z.unknown().optional()})

export default async function runQuickJS(task: QuickJSTask): Promise<ExecutionResult> {
  const host = createBirpc<HostCalls>(
    {},
    {post: (data) => task.port.postMessage(data), on: (listener) => task.port.on('message', listener), timeout: -1},
  )
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

function bindingOver(host: HostCalls, name: string): ToolBinding {
  return {
    name,
    description: name,
    inputSchema: {},
    execute: async (args) => ResultValueSchema.parse(JSON.parse(await host.call(name, args))).value,
  }
}
