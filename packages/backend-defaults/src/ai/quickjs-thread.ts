import {availableParallelism} from 'node:os'
import {extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {MessageChannel, type Worker} from 'node:worker_threads'
import {ORPCError, os} from '@orpc/server'
import {RPCHandler} from '@orpc/server/message-port'
import {move, Piscina, transferableSymbol, valueSymbol} from 'piscina'
import {z} from 'zod'
import type {ExecutionResult, IsolateConfig, IsolateContext, IsolateDriver} from '@tanstack/ai-code-mode'
import {Effect} from 'effect'
import type {QuickJSTask} from './quickjs-worker.js'
import type {EngineRuntime} from '../engine/lib/logging.js'

const HARD_STOP_GRACE_MS = 1000

const BOOT_DEADLINE_MS = 30_000

const SPARE_IDLE_MS = 60_000

const CLOSE_PASSES = 3

const WORKER_FILE = new URL(`./quickjs-worker${extname(fileURLToPath(import.meta.url))}`, import.meta.url)

type QuickJSThreadLimits = {timeout: number; memoryLimit: number; maxStackSize: number}

export type OpenPool = {pool: Piscina<ReturnType<typeof move>, ExecutionResult>; closed: AbortController}

type Retired = {signal: AbortSignal; result: ExecutionResult}

type Deadlines = {notStarted: AbortSignal; hardStop: AbortSignal}

type ToolContext = {
  bindings: IsolateConfig['bindings']
  started: () => void
  retire: (result: ExecutionResult) => void
}

export type CodeDriver = IsolateDriver & {dispose: () => Promise<void>}

const toolRouter = {
  started: os.$context<ToolContext>().handler(({context}) => context.started()),
  invoke: os
    .$context<ToolContext>()
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
  retire: os
    .$context<ToolContext>()
    .input(z.object({error: z.object({name: z.string(), message: z.string()}), logs: z.array(z.string())}))
    .handler(({input, context}) => context.retire({success: false, ...input})),
}

export type ToolRouter = typeof toolRouter

const toolHandler = new RPCHandler(toolRouter)

export function quickJSThreadDriver(limits: QuickJSThreadLimits, runtime: EngineRuntime): CodeDriver {
  const held: {open: OpenPool | null} = {open: openPool(runtime)}
  const current = (): OpenPool => {
    held.open ??= openPool(runtime)
    return held.open
  }
  return {
    createContext: async (config) => threadContext(config, limits, current, runtime),
    dispose: async () => {
      const closing = held.open
      held.open = null
      if (closing !== null) await closePool(closing, runtime)
    },
  }
}

export function openPool(runtime: EngineRuntime): OpenPool {
  const pool = new Piscina<ReturnType<typeof move>, ExecutionResult>({
    filename: WORKER_FILE.href,
    minThreads: 1,
    maxThreads: Math.max(2, availableParallelism()),
    idleTimeout: SPARE_IDLE_MS,
  })
  pool.on('error', (error: Error) => runtime.runFork(Effect.logError('[ai] the QuickJS worker failed', {error})))
  return {pool, closed: new AbortController()}
}

export async function closePool(open: OpenPool, runtime: EngineRuntime, passes = CLOSE_PASSES): Promise<void> {
  open.closed.abort()
  const threads = open.pool.threads
  await Promise.all([open.pool.destroy(), ...threads.map(waitForExit)])
  const left = open.pool.threads
  if (left.length === 0) return
  const respawned = left.some((thread) => !threads.includes(thread))
  if (respawned && passes > 1) {
    await closePool(open, runtime, passes - 1)
    return
  }
  runtime.runFork(
    Effect.logWarning('[ai] the QuickJS pool still held workers after shutting down; terminating them', {
      workers: left.length,
    }),
  )
  await Promise.all(left.map(async (thread) => thread.terminate()))
}

function threadContext(
  config: IsolateConfig,
  limits: QuickJSThreadLimits,
  current: () => OpenPool,
  runtime: EngineRuntime,
): IsolateContext {
  current()
  const disposed = new AbortController()
  return {
    execute: async <T>(code: string): Promise<ExecutionResult<T>> => {
      const result = await run(current(), config, limits, code, disposed.signal, runtime)
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
  runtime: EngineRuntime,
): Promise<ExecutionResult> {
  const timeout = config.timeout ?? limits.timeout
  const {port1, port2} = new MessageChannel()
  const retiring = new AbortController()
  const retired: Retired = {signal: retiring.signal, result: STOPPED}
  const retire = (result: ExecutionResult) => {
    retired.result = result
    retiring.abort()
  }
  const notStarted = new AbortController()
  const began = new AbortController()
  AbortSignal.timeout(BOOT_DEADLINE_MS).addEventListener('abort', () => notStarted.abort(), {
    once: true,
    signal: began.signal,
  })
  const hardStop = new AbortController()
  const started = () => {
    began.abort()
    AbortSignal.timeout(timeout + HARD_STOP_GRACE_MS).addEventListener('abort', () => hardStop.abort(), {once: true})
  }
  toolHandler.upgrade(port1, {context: {bindings: config.bindings, started, retire}})
  const task: QuickJSTask = {
    code,
    names: Object.keys(config.bindings),
    timeout,
    memoryLimit: config.memoryLimit ?? limits.memoryLimit,
    maxStackSize: limits.maxStackSize,
    port: port2,
  }
  const signal = AbortSignal.any([disposed, notStarted.signal, hardStop.signal, retiring.signal])
  const aborting: {threads: Worker[]} = {threads: []}
  signal.addEventListener('abort', () => (aborting.threads = pool.threads), {once: true})
  try {
    return await pool.run(move({[transferableSymbol]: [port2], [valueSymbol]: task}), {signal})
  } catch (error) {
    if (!signal.aborted) return closed.signal.aborted ? STOPPED : workerFailure(error, runtime)
    await exited(pool, aborting.threads)
    return abortedWith(signal.reason, {notStarted: notStarted.signal, hardStop: hardStop.signal}, retired)
  } finally {
    port1.close()
  }
}

function abortedWith(reason: unknown, deadlines: Deadlines, retired: Retired): ExecutionResult {
  if (reason === retired.signal.reason) return retired.result
  if (reason === deadlines.notStarted.reason) return NOT_STARTED
  return reason === deadlines.hardStop.reason ? TIMED_OUT : STOPPED
}

async function exited(pool: Piscina, threads: Worker[]): Promise<void> {
  await Promise.all(threads.filter((thread) => !pool.threads.includes(thread)).map(waitForExit))
}

function waitForExit(thread: Worker): Promise<void> {
  if (thread.threadId === -1) return Promise.resolve()
  return new Promise((exit) => thread.once('exit', () => exit()))
}

function workerFailure(error: unknown, runtime: EngineRuntime): ExecutionResult {
  const {name, message} = error instanceof Error ? error : {name: 'WorkerError', message: String(error)}
  runtime.runFork(Effect.logError('[ai] the QuickJS worker failed', {name, message}))
  return failure(name, message)
}

function failure(name: string, message: string): ExecutionResult {
  return {success: false, error: {name, message}, logs: []}
}

const TIMED_OUT = failure('TimeoutError', 'Code execution timed out')

const STOPPED = failure('AbortError', 'Code execution was stopped')

const NOT_STARTED = failure(
  'WORKER_NOT_STARTED',
  `the code mode worker did not start within ${BOOT_DEADLINE_MS / 1000}s`,
)
