import {randomUUID} from 'node:crypto'
import {parentPort, type MessagePort} from 'node:worker_threads'
import {z} from 'zod'
import {createQuickJSIsolateDriver} from '@tanstack/ai-isolate-quickjs'
import type {IsolateContext, ToolBinding} from '@tanstack/ai-code-mode'
import {HostMessageSchema, type CallOutcome, type WorkerMessage, type WorkerSetup} from './quickjs-messages.js'

const ResultValueSchema = z.object({value: z.unknown().optional()})

function announce(port: MessagePort, message: WorkerMessage): void {
  port.postMessage(message)
}

function bindingsOver(port: MessagePort, names: string[], pending: Map<string, PromiseWithResolvers<unknown>>) {
  return Object.fromEntries(
    names.map((name): [string, ToolBinding] => [
      name,
      {
        name,
        description: name,
        inputSchema: {},
        execute: (args) => {
          const id = randomUUID()
          const call = Promise.withResolvers<unknown>()
          pending.set(id, call)
          announce(port, {type: 'call', id, name, args})
          return call.promise
        },
      },
    ]),
  )
}

async function loadQuickJS(): Promise<void> {
  const context = await createQuickJSIsolateDriver().createContext({bindings: {}})
  await context.dispose()
}

function contextFor(port: MessagePort, setup: WorkerSetup, pending: Map<string, PromiseWithResolvers<unknown>>) {
  return createQuickJSIsolateDriver(setup).createContext({
    bindings: bindingsOver(port, setup.names, pending),
    timeout: setup.timeout,
    memoryLimit: setup.memoryLimit,
  })
}

function errorOf(error: unknown) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  }
}

function failedRun(error: unknown) {
  return {success: false, error: errorOf(error), logs: []}
}

function run(context: Promise<IsolateContext> | null, code: string) {
  if (context === null) return Promise.resolve(failedRun(new Error('the QuickJS worker has no context to run in')))
  return context.then((built) => built.execute(code)).catch(failedRun)
}

function toolValue(json: string): {ok: true; value: unknown} | {ok: false} {
  try {
    const parsed = ResultValueSchema.safeParse(JSON.parse(json))
    return parsed.success ? {ok: true, value: parsed.data.value} : {ok: false}
  } catch {
    return {ok: false}
  }
}

function settleCall(call: PromiseWithResolvers<unknown> | undefined, outcome: CallOutcome): void {
  if (!outcome.ok) return call?.reject(new Error(outcome.message))
  const read = toolValue(outcome.json)
  if (read.ok) return call?.resolve(read.value)
  call?.reject(new Error('the tool returned a result the sandbox could not read'))
}

function serve(port: MessagePort): void {
  const pending = new Map<string, PromiseWithResolvers<unknown>>()
  const held: {context: Promise<IsolateContext> | null} = {context: null}
  const fail = (error: unknown) => announce(port, {type: 'failed', error: errorOf(error)})
  port.on('message', (raw: unknown) => {
    const parsed = HostMessageSchema.safeParse(raw)
    if (!parsed.success) {
      fail(new Error(`the QuickJS worker got an unreadable message: ${parsed.error.message}`))
      port.close()
      return
    }
    const message = parsed.data
    if (message.type === 'setup') {
      held.context = contextFor(port, message.setup, pending)
      void held.context.then(() => announce(port, {type: 'ready'}), fail)
      return
    }
    if (message.type === 'reset') {
      const context = held.context
      held.context = null
      pending.clear()
      void Promise.resolve(context?.then((built) => built.dispose())).then(() => announce(port, {type: 'loaded'}), fail)
      return
    }
    if (message.type === 'execute') {
      void run(held.context, message.code).then((result) => announce(port, {type: 'done', result}))
      return
    }
    const call = pending.get(message.id)
    pending.delete(message.id)
    settleCall(call, message.outcome)
  })
  announce(port, {type: 'loaded'})
}

if (parentPort === null) throw new Error('the QuickJS worker runs only inside a worker thread')
const port = parentPort
await loadQuickJS().then(
  () => serve(port),
  (error: unknown) => {
    announce(port, {type: 'failed', error: errorOf(error)})
    port.close()
  },
)
