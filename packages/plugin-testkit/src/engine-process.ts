import {fork, type ChildProcess} from 'node:child_process'
import {join} from 'node:path'
import {z} from 'zod'

export type EngineCall = {kind: 'reply'; text: string} | {kind: 'hold'} | {kind: 'release'} | {kind: 'session'}

export type EngineProcess = {
  apiBase: string
  token: string
  call: (call: EngineCall) => Promise<unknown>
  stop: () => Promise<void>
}

const EngineAnswerSchema = z.discriminatedUnion('ok', [
  z.object({id: z.number(), ok: z.literal(true), value: z.unknown().optional()}),
  z.object({id: z.number(), ok: z.literal(false), error: z.string()}),
])

const EngineReadySchema = z.object({apiBase: z.string(), token: z.string()})

type Pending = {resolve: (value: unknown) => void; reject: (error: Error) => void}

const ENGINE_CHILD = join(import.meta.dirname, '../dist/engine-child.js')

function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => child.once('exit', () => resolve()))
}

export async function forkEngine(): Promise<EngineProcess> {
  const child = fork(ENGINE_CHILD, [], {execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc']})
  const pending = new Map<number, Pending>()
  const next = {id: 1}
  const failAll = (error: Error): void => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }
  child.on('message', (raw) => {
    const answer = EngineAnswerSchema.safeParse(raw)
    if (!answer.success) return failAll(new Error(`the engine child sent a malformed answer: ${answer.error.message}`))
    const waiter = pending.get(answer.data.id)
    if (!waiter) return failAll(new Error(`the engine child answered an unknown request ${answer.data.id}`))
    pending.delete(answer.data.id)
    if (answer.data.ok) return waiter.resolve(answer.data.value)
    waiter.reject(new Error(answer.data.error))
  })
  child.once('exit', (code, signal) => failAll(new Error(`the engine child exited (code ${code}, signal ${signal})`)))
  child.once('error', failAll)
  const ask = (id: number): Promise<unknown> =>
    new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject})
    })
  const ready = EngineReadySchema.parse(await ask(0))
  return {
    ...ready,
    call: (call) => {
      const id = next.id++
      const answer = ask(id)
      child.send({id, call})
      return answer
    },
    stop: async () => {
      if (child.connected) child.disconnect()
      await exited(child)
    },
  }
}
