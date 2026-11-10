import {availableParallelism} from 'node:os'
import {MessageChannel} from 'node:worker_threads'
import {ORPCError, os} from '@orpc/server'
import {RPCHandler} from '@orpc/server/message-port'
import Tinypool, {type TinypoolWorker} from 'tinypool'
import {z} from 'zod'
import type {ExecutionResult, IsolateConfig, IsolateContext, IsolateDriver} from '@tanstack/ai-code-mode'
import type {QuickJSTask} from './quickjs-worker.js'

const HARD_STOP_GRACE_MS = 1000

const SPARE_IDLE_MS = 60_000

const RETIRING_ERRORS: ReadonlySet<string> = new Set([
  'TimeoutError',
  'MemoryLimitError',
  'StackOverflowError',
  'WasmRuntimeError',
])

type QuickJSThreadLimits = {timeout: number; memoryLimit: number; maxStackSize: number}

type Log = (message: string) => void

type OpenPool = {pool: Tinypool; closed: AbortController}

export type CodeDriver = IsolateDriver & {dispose: () => Promise<void>}

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

export function quickJSThreadDriver(limits: QuickJSThreadLimits, log: Log): CodeDriver {
  const held: {open: OpenPool | null} = {open: openPool(log)}
  const current = (): OpenPool => {
    held.open ??= openPool(log)
    return held.open
  }
  return {
    createContext: async (config) => threadContext(config, limits, current, log),
    dispose: async () => {
      const closing = held.open
      held.open = null
      closing?.closed.abort()
      await closing?.pool.destroy()
    },
  }
}

function openPool(log: Log): OpenPool {
  const pool = new Tinypool({
    filename: new URL('./quickjs-worker.js', import.meta.url).href,
    minThreads: 1,
    maxThreads: Math.max(2, availableParallelism()),
    idleTimeout: SPARE_IDLE_MS,
  })
  pool.on('error', (error: Error) => log(`[ai] the QuickJS worker failed: ${error.name}: ${error.message}`))
  return {pool, closed: new AbortController()}
}

function threadContext(
  config: IsolateConfig,
  limits: QuickJSThreadLimits,
  current: () => OpenPool,
  log: Log,
): IsolateContext {
  current()
  const disposed = new AbortController()
  return {
    execute: async <T>(code: string): Promise<ExecutionResult<T>> => {
      const result = await run(current(), config, limits, code, disposed.signal, log)
      return {...result, value: z.custom<T>().parse(result.value)}
    },
    dispose: async () => disposed.abort(),
  }
}

async function run(
  {pool, closed}: OpenPool,
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
  const aborting: {threads: TinypoolWorker[]} = {threads: []}
  signal.addEventListener('abort', () => (aborting.threads = pool.threads), {once: true})
  try {
    const result: ExecutionResult = await pool.run(task, {signal, transferList: {transfer: [port2]}})
    if (retires(result)) await pool.recycleWorkers()
    return result
  } catch (error) {
    if (!signal.aborted) return closed.signal.aborted ? STOPPED : workerFailure(pool, error, log)
    await exited(pool, aborting.threads)
    return signal.reason === timedOut.reason ? TIMED_OUT : STOPPED
  } finally {
    port1.close()
  }
}

function retires(result: ExecutionResult): boolean {
  return !result.success && RETIRING_ERRORS.has(result.error?.name ?? '')
}

async function exited(pool: Tinypool, threads: TinypoolWorker[]): Promise<void> {
  const ending = threads.filter((thread) => !pool.threads.includes(thread))
  await Promise.all(ending.map((thread) => new Promise((exit) => thread.once('exit', exit))))
}

async function workerFailure(pool: Tinypool, error: unknown, log: Log): Promise<ExecutionResult> {
  const {name, message} = error instanceof Error ? error : {name: 'WorkerError', message: String(error)}
  log(`[ai] the QuickJS worker failed: ${name}: ${message}`)
  await pool.recycleWorkers()
  return failure(name, message)
}

function failure(name: string, message: string): ExecutionResult {
  return {success: false, error: {name, message}, logs: []}
}

const TIMED_OUT = failure('TimeoutError', 'Code execution timed out')

const STOPPED = failure('AbortError', 'Code execution was stopped')
