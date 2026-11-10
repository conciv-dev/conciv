import {MessageChannel} from 'node:worker_threads'
import {createBirpc} from 'birpc'
import Tinypool from 'tinypool'
import {z} from 'zod'
import type {ExecutionResult, IsolateConfig, IsolateContext, IsolateDriver} from '@tanstack/ai-code-mode'
import type runQuickJS from './quickjs-worker.js'

const HARD_STOP_GRACE_MS = 1000

type QuickJSThreadLimits = {timeout: number; memoryLimit: number; maxStackSize: number}

type Log = (message: string) => void

type QuickJSTask = Parameters<typeof runQuickJS>[0]

export function quickJSThreadDriver(limits: QuickJSThreadLimits, log: Log): IsolateDriver {
  const pool = new Tinypool({
    filename: new URL('./quickjs-worker.js', import.meta.url).href,
    isolateWorkers: true,
    minThreads: 0,
  })
  pool.on('error', (error: Error) => log(`[ai] the QuickJS worker failed: ${error.name}: ${error.message}`))
  return {createContext: async (config) => threadContext(pool, config, limits, log)}
}

function threadContext(pool: Tinypool, config: IsolateConfig, limits: QuickJSThreadLimits, log: Log): IsolateContext {
  const disposed = new AbortController()
  return {
    execute: async <T>(code: string): Promise<ExecutionResult<T>> => {
      const result = await run(pool, config, limits, code, disposed.signal, log)
      return {...result, value: z.custom<T>().parse(result.value)}
    },
    dispose: async () => disposed.abort(),
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
  createBirpc(
    {call: (name: string, args: unknown) => callBinding(config, name, args)},
    {post: (data) => port1.postMessage(data), on: (listener) => port1.on('message', listener)},
  )
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

async function callBinding(config: IsolateConfig, name: string, args: unknown): Promise<string> {
  const binding = config.bindings[name]
  if (binding === undefined) throw new Error(`${name} is not a tool binding`)
  return JSON.stringify({value: await binding.execute(args)})
}

function failure(name: string, message: string): ExecutionResult {
  return {success: false, error: {name, message}, logs: []}
}

const TIMED_OUT = failure('TimeoutError', 'Code execution timed out')

const STOPPED = failure('AbortError', 'Code execution was stopped')
