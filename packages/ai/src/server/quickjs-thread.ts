import {MessageChannel} from 'node:worker_threads'
import {ORPCError, os} from '@orpc/server'
import {RPCHandler} from '@orpc/server/message-port'
import Tinypool from 'tinypool'
import {z} from 'zod'
import type {ExecutionResult, IsolateConfig, IsolateContext, IsolateDriver} from '@tanstack/ai-code-mode'
import type {QuickJSTask} from './quickjs-worker.js'

const HARD_STOP_GRACE_MS = 1000

type QuickJSThreadLimits = {timeout: number; memoryLimit: number; maxStackSize: number}

type Log = (message: string) => void

const toolRouter = {
  call: os
    .$context<{bindings: IsolateConfig['bindings']}>()
    .input(z.object({name: z.string(), args: z.unknown()}))
    .handler(async ({input, context}) => {
      const binding = context.bindings[input.name]
      if (binding === undefined) throw new ORPCError('NOT_FOUND', {message: `${input.name} is not a tool binding`})
      try {
        return await binding.execute(input.args)
      } catch (error) {
        throw new ORPCError('TOOL_FAILED', {message: error instanceof Error ? error.message : String(error)})
      }
    }),
}

export type ToolRouter = typeof toolRouter

const toolHandler = new RPCHandler(toolRouter)

export function quickJSThreadDriver(limits: QuickJSThreadLimits, log: Log): IsolateDriver {
  return {createContext: async (config) => threadContext(config, limits, log)}
}

function threadContext(config: IsolateConfig, limits: QuickJSThreadLimits, log: Log): IsolateContext {
  const pool = new Tinypool({
    filename: new URL('./quickjs-worker.js', import.meta.url).href,
    isolateWorkers: true,
    minThreads: 0,
    maxThreads: 1,
  })
  pool.on('error', (error: Error) => log(`[ai] the QuickJS worker failed: ${error.name}: ${error.message}`))
  const disposed = new AbortController()
  return {
    execute: async <T>(code: string): Promise<ExecutionResult<T>> => {
      const result = await run(pool, config, limits, code, disposed.signal, log)
      return {...result, value: z.custom<T>().parse(result.value)}
    },
    dispose: async () => {
      disposed.abort()
      await pool.destroy()
    },
  }
}

async function run(
  pool: Tinypool,
  config: IsolateConfig,
  limits: QuickJSThreadLimits,
  code: string,
  disposed: AbortSignal,
  log: Log,
): Promise<ExecutionResult> {
  const timeout = config.timeout ?? limits.timeout
  const {port1, port2} = new MessageChannel()
  toolHandler.upgrade(port1, {context: {bindings: config.bindings}})
  const task: QuickJSTask = {
    code,
    names: Object.keys(config.bindings),
    timeout,
    memoryLimit: config.memoryLimit ?? limits.memoryLimit,
    maxStackSize: limits.maxStackSize,
    port: port2,
  }
  const timedOut = AbortSignal.timeout(timeout + HARD_STOP_GRACE_MS)
  const signal = AbortSignal.any([disposed, timedOut])
  try {
    return await pool.run(task, {signal, transferList: {transfer: [port2]}})
  } catch (error) {
    if (signal.aborted) return signal.reason === timedOut.reason ? TIMED_OUT : STOPPED
    const {name, message} = error instanceof Error ? error : {name: 'WorkerError', message: String(error)}
    log(`[ai] the QuickJS worker failed: ${name}: ${message}`)
    return failure(name, message)
  } finally {
    port1.close()
  }
}

function failure(name: string, message: string): ExecutionResult {
  return {success: false, error: {name, message}, logs: []}
}

const TIMED_OUT = failure('TimeoutError', 'Code execution timed out')

const STOPPED = failure('AbortError', 'Code execution was stopped')
