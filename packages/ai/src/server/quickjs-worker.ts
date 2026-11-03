import {randomUUID} from 'node:crypto'
import {parentPort, workerData, type MessagePort} from 'node:worker_threads'
import {z} from 'zod'
import {createQuickJSIsolateDriver} from '@tanstack/ai-isolate-quickjs'
import type {ToolBinding} from '@tanstack/ai-code-mode'
import {HostMessageSchema, WorkerSetupSchema, type WorkerMessage} from './quickjs-messages.js'

const ResultValueSchema = z.object({value: z.unknown().optional()})

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
          const message: WorkerMessage = {type: 'call', id, name, args}
          port.postMessage(message)
          return call.promise
        },
      },
    ]),
  )
}

async function serve(port: MessagePort): Promise<void> {
  const setup = WorkerSetupSchema.parse(workerData)
  const pending = new Map<string, PromiseWithResolvers<unknown>>()
  const context = await createQuickJSIsolateDriver(setup).createContext({
    bindings: bindingsOver(port, setup.names, pending),
    timeout: setup.timeout,
    memoryLimit: setup.memoryLimit,
  })
  port.on('message', (raw: unknown) => {
    const message = HostMessageSchema.parse(raw)
    if (message.type === 'execute') {
      void context
        .execute(message.code)
        .catch((error: unknown) => ({
          success: false,
          error: {
            name: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
          },
          logs: [],
        }))
        .then((result) => {
          const done: WorkerMessage = {type: 'done', result}
          port.postMessage(done)
        })
      return
    }
    const call = pending.get(message.id)
    pending.delete(message.id)
    if (!message.outcome.ok) return call?.reject(new Error(message.outcome.message))
    call?.resolve(ResultValueSchema.parse(JSON.parse(message.outcome.json)).value)
  })
  const ready: WorkerMessage = {type: 'ready'}
  port.postMessage(ready)
}

if (parentPort === null) throw new Error('the QuickJS worker runs only inside a worker thread')
await serve(parentPort)
