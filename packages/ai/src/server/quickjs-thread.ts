import {Worker} from 'node:worker_threads'
import {z} from 'zod'
import type {ExecutionResult, IsolateConfig, IsolateContext, IsolateDriver} from '@tanstack/ai-code-mode'
import {WorkerMessageSchema, type CallOutcome, type HostMessage, type WorkerSetup} from './quickjs-messages.js'

const HARD_STOP_GRACE_MS = 1000

type QuickJSThreadLimits = {timeout: number; memoryLimit: number; maxStackSize: number}

type Log = (message: string) => void

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

function serveCalls(worker: Worker, config: IsolateConfig): void {
  worker.on('message', (raw: unknown) => {
    const message = WorkerMessageSchema.safeParse(raw)
    if (!message.success || message.data.type !== 'call') return
    const {id, name, args} = message.data
    void answer(config, name, args).then((outcome) => {
      const reply: HostMessage = {type: 'result', id, outcome}
      worker.postMessage(reply)
    })
  })
}

function nextMessage(worker: Worker, type: 'ready' | 'done', limitMs: number, signal: AbortSignal) {
  return new Promise<ExecutionResult>((resolve) => {
    const settle = (result: ExecutionResult) => {
      clearTimeout(timer)
      worker.off('message', onMessage)
      worker.off('error', onError)
      worker.off('exit', onExit)
      signal.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const stop = (result: ExecutionResult) => {
      settle(result)
      void worker.terminate()
    }
    const onMessage = (raw: unknown) => {
      const message = WorkerMessageSchema.safeParse(raw)
      if (!message.success) return stop(failure('WorkerError', 'the QuickJS worker sent an unreadable message'))
      if (message.data.type === 'ready' && type === 'ready') return settle({success: true})
      if (message.data.type === 'done' && type === 'done') return settle(message.data.result)
    }
    const onError = (error: Error) => stop(failure(error.name, error.message))
    const onExit = (code: number) => settle(failure('WorkerError', `the QuickJS worker exited with code ${code}`))
    const onAbort = () => stop(STOPPED)
    const timer = setTimeout(() => stop(TIMED_OUT), limitMs)
    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
    signal.addEventListener('abort', onAbort)
    if (signal.aborted) stop(STOPPED)
  })
}

async function threadContext(config: IsolateConfig, limits: QuickJSThreadLimits, log: Log): Promise<IsolateContext> {
  const timeout = config.timeout ?? limits.timeout
  const setup: WorkerSetup = {
    names: Object.keys(config.bindings),
    timeout,
    memoryLimit: config.memoryLimit ?? limits.memoryLimit,
    maxStackSize: limits.maxStackSize,
  }
  const worker = new Worker(new URL('./quickjs-worker.js', import.meta.url), {workerData: setup})
  const disposed = new AbortController()
  worker.on('error', (error: Error) => log(`[ai] the QuickJS worker failed: ${error.name}: ${error.message}`))
  serveCalls(worker, config)
  const ready = await nextMessage(worker, 'ready', timeout, disposed.signal)
  if (!ready.success) {
    await worker.terminate()
    throw new Error(ready.error?.message ?? 'the QuickJS worker failed to start')
  }
  return {
    execute: async <T>(code: string): Promise<ExecutionResult<T>> => {
      const done = nextMessage(worker, 'done', timeout + HARD_STOP_GRACE_MS, disposed.signal)
      const message: HostMessage = {type: 'execute', code}
      worker.postMessage(message)
      const result = await done
      return {...result, value: z.custom<T>().parse(result.value)}
    },
    dispose: async () => {
      disposed.abort()
      await worker.terminate()
    },
  }
}

export function quickJSThreadDriver(limits: QuickJSThreadLimits, log: Log): IsolateDriver {
  return {createContext: (config) => threadContext(config, limits, log)}
}
