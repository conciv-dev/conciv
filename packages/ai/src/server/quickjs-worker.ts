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

type RunError = {name: string; message: string}

const RETIRING_ERRORS: ReadonlySet<string> = new Set([
  'TimeoutError',
  'MemoryLimitError',
  'StackOverflowError',
  'WasmRuntimeError',
  'RuntimeError',
])

const loaded = await createQuickJSIsolateDriver().createContext({bindings: {}})
await loaded.dispose()

export default async function runQuickJS(task: QuickJSTask): Promise<ExecutionResult> {
  const host: Host = createORPCClient(new RPCLink({port: task.port}))
  try {
    const result = await execution(task, host).catch(failedRun)
    const retiring = retiringError(result)
    if (retiring === null) return result
    await host.retire({error: retiring, logs: result.logs ?? []})
    return await new Promise<never>(() => {})
  } finally {
    task.port.close()
  }
}

async function execution(task: QuickJSTask, host: Host): Promise<ExecutionResult> {
  const context = await createQuickJSIsolateDriver(task).createContext({
    bindings: Object.fromEntries(task.names.map((name) => [name, bindingOver(host, name)])),
    timeout: task.timeout,
    memoryLimit: task.memoryLimit,
  })
  const result = await context.execute(task.code).catch(failedRun)
  await context.dispose()
  return result
}

function failedRun(error: unknown): ExecutionResult {
  return {
    success: false,
    error: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    },
    logs: [],
  }
}

function retiringError(result: ExecutionResult): RunError | null {
  if (result.success || result.error === undefined || !RETIRING_ERRORS.has(result.error.name)) return null
  return {name: result.error.name, message: result.error.message}
}

function bindingOver(host: Host, name: string): ToolBinding {
  return {
    name,
    description: name,
    inputSchema: {},
    execute: (args) => host.call({name, args}),
  }
}
