import {randomUUID} from 'node:crypto'
import {parentPort, type MessagePort} from 'node:worker_threads'
import {z} from 'zod'
import {createQuickJSIsolateDriver} from '@tanstack/ai-isolate-quickjs'
import type {IsolateContext, ToolBinding} from '@tanstack/ai-code-mode'
import {HostMessageSchema, type WorkerMessage, type WorkerSetup} from './quickjs-messages.js'

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

function run(context: IsolateContext, code: string) {
  return context.execute(code).catch((error: unknown) => ({
    success: false,
    error: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    },
    logs: [],
  }))
}

function serve(port: MessagePort): void {
  const pending = new Map<string, PromiseWithResolvers<unknown>>()
  const held: {context: Promise<IsolateContext> | null} = {context: null}
  port.on('message', (raw: unknown) => {
    const message = HostMessageSchema.parse(raw)
    if (message.type === 'setup') {
      held.context = contextFor(port, message.setup, pending)
      void held.context.then(() => announce(port, {type: 'ready'}))
      return
    }
    if (message.type === 'reset') {
      const context = held.context
      held.context = null
      pending.clear()
      void Promise.resolve(context?.then((built) => built.dispose())).then(() => announce(port, {type: 'loaded'}))
      return
    }
    if (message.type === 'execute') {
      void held.context
        ?.then((context) => run(context, message.code))
        .then((result) => announce(port, {type: 'done', result}))
      return
    }
    const call = pending.get(message.id)
    pending.delete(message.id)
    if (!message.outcome.ok) return call?.reject(new Error(message.outcome.message))
    call?.resolve(ResultValueSchema.parse(JSON.parse(message.outcome.json)).value)
  })
  announce(port, {type: 'loaded'})
}

if (parentPort === null) throw new Error('the QuickJS worker runs only inside a worker thread')
await loadQuickJS()
serve(parentPort)
