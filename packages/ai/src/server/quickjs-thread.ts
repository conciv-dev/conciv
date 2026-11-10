import {Worker} from 'node:worker_threads'
import {z} from 'zod'
import type {ExecutionResult, IsolateConfig, IsolateContext, IsolateDriver} from '@tanstack/ai-code-mode'
import {WorkerMessageSchema, type CallOutcome, type HostMessage, type WorkerSetup} from './quickjs-messages.js'

const HARD_STOP_GRACE_MS = 1000

type QuickJSThreadLimits = {timeout: number; memoryLimit: number; maxStackSize: number}

type Log = (message: string) => void

type Spare = {worker: Worker; loaded: Promise<ExecutionResult>}

function failure(name: string, message: string): ExecutionResult {
  return {success: false, error: {name, message}, logs: []}
}

const TIMED_OUT = failure('TimeoutError', 'Code execution timed out')

const STOPPED = failure('AbortError', 'Code execution was stopped')

async function answer(config: IsolateConfig, name: string, args: unknown): Promise<CallOutcome> {
  const binding = config.bindings[name]
  if (binding === undefined) return {ok: false, message: `${name} is not a tool binding`}
  try {
    return {ok: true, json: JSON.stringify({value: await binding.execute(args)})}
  } catch (error) {
    return {ok: false, message: error instanceof Error ? error.message : String(error)}
  }
}

function serveCalls(worker: Worker, config: IsolateConfig): () => void {
  const onMessage = (raw: unknown) => {
    const message = WorkerMessageSchema.safeParse(raw)
    if (!message.success || message.data.type !== 'call') return
    const {id, name, args} = message.data
    void answer(config, name, args).then((outcome) => {
      const reply: HostMessage = {type: 'result', id, outcome}
      worker.postMessage(reply)
    })
  }
  worker.on('message', onMessage)
  return () => worker.off('message', onMessage)
}

function nextMessage(worker: Worker, type: 'loaded' | 'ready' | 'done', limitMs: number, signal?: AbortSignal) {
  return new Promise<ExecutionResult>((resolve) => {
    const settle = (result: ExecutionResult) => {
      clearTimeout(timer)
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const stop = (result: ExecutionResult) => {
      settle(result)
      void worker.terminate()
    }
    const onMessage = (raw: unknown) => {
      const message = WorkerMessageSchema.safeParse(raw)
      if (!message.success) return stop(failure('WorkerError', 'the QuickJS worker sent an unreadable message'))
      if (message.data.type === 'done' && type === 'done') return settle(message.data.result)
      if (message.data.type === type) return settle({success: true})
    }
    const onError = (error: Error) => stop(failure(error.name, error.message))
    const onExit = (code: number) => settle(failure('WorkerError', `the QuickJS worker exited with code ${code}`))
    const onAbort = () => stop(STOPPED)
    const timer = setTimeout(() => stop(TIMED_OUT), limitMs)
    timer.unref()
    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
    signal?.addEventListener('abort', onAbort)
    if (signal?.aborted) stop(STOPPED)
  })
}

type Release = (worker: Worker, clean: boolean) => Promise<void>

async function threadContext(config: IsolateConfig, limits: QuickJSThreadLimits, worker: Worker, release: Release) {
  const timeout = config.timeout ?? limits.timeout
  const setup: WorkerSetup = {
    names: Object.keys(config.bindings),
    timeout,
    memoryLimit: config.memoryLimit ?? limits.memoryLimit,
    maxStackSize: limits.maxStackSize,
  }
  const disposed = new AbortController()
  const state = {clean: true, running: 0}
  worker.ref()
  const stopServing = serveCalls(worker, config)
  const ready = nextMessage(worker, 'ready', timeout, disposed.signal)
  const message: HostMessage = {type: 'setup', setup}
  worker.postMessage(message)
  const built = await ready
  if (!built.success) {
    stopServing()
    await release(worker, false)
    throw new Error(built.error?.message ?? 'the QuickJS worker failed to start')
  }
  const context: IsolateContext = {
    execute: async <T>(code: string): Promise<ExecutionResult<T>> => {
      state.running += 1
      const done = nextMessage(worker, 'done', timeout + HARD_STOP_GRACE_MS, disposed.signal)
      const run: HostMessage = {type: 'execute', code}
      worker.postMessage(run)
      const result = await done
      state.running -= 1
      if (!result.success) state.clean = false
      return {...result, value: z.custom<T>().parse(result.value)}
    },
    dispose: async () => {
      if (disposed.signal.aborted) return
      const clean = state.clean && state.running === 0 && worker.threadId !== -1
      disposed.abort()
      stopServing()
      await release(worker, clean)
    },
  }
  return context
}

export function quickJSThreadDriver(
  limits: QuickJSThreadLimits,
  log: Log,
): IsolateDriver & {dispose: () => Promise<void>} {
  const live = new Set<Worker>()
  const held: {spare: Spare | null; open: boolean} = {spare: null, open: false}
  const boot = (): Spare => {
    const worker = new Worker(new URL('./quickjs-worker.js', import.meta.url))
    live.add(worker)
    worker.unref()
    worker.on('error', (error: Error) => log(`[ai] the QuickJS worker failed: ${error.name}: ${error.message}`))
    worker.on('exit', () => live.delete(worker))
    return {worker, loaded: nextMessage(worker, 'loaded', limits.timeout)}
  }
  const reset = (worker: Worker): Spare => {
    worker.unref()
    const loaded = nextMessage(worker, 'loaded', limits.timeout)
    const message: HostMessage = {type: 'reset'}
    worker.postMessage(message)
    return {worker, loaded}
  }
  const release: Release = async (worker, clean) => {
    if (clean && held.open && held.spare === null) {
      held.spare = reset(worker)
      return
    }
    await worker.terminate()
    if (held.open) held.spare ??= boot()
  }
  const take = (): Spare => {
    const taken = held.spare ?? boot()
    held.spare = null
    return taken
  }
  const loadedWorker = async (spare: Spare): Promise<Worker | null> => {
    const loaded = await spare.loaded
    if (loaded.success && spare.worker.threadId !== -1) return spare.worker
    await spare.worker.terminate()
    return null
  }
  const claim = async (): Promise<Worker> => {
    held.open = true
    const worker = (await loadedWorker(take())) ?? (await loadedWorker(take()))
    if (worker === null) throw new Error('the QuickJS worker failed to start')
    return worker
  }
  return {
    createContext: async (config) => threadContext(config, limits, await claim(), release),
    dispose: async () => {
      held.open = false
      held.spare = null
      await Promise.all([...live].map((worker) => worker.terminate()))
    },
  }
}
