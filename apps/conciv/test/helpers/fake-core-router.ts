import {implement} from '@orpc/server'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {contract} from '@conciv/contract'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import {sessionRow} from './fake-core.js'

const os = implement(contract).$context<RpcContext>()

const RUN_ID = 'conciv_run_1'

export type FakeCoreStream = {
  push: (chunk: StreamChunk) => void
  subscribeCount: () => number
}

function makeStream(): {
  stream: FakeCoreStream
  subscribe: (signal: AbortSignal) => AsyncGenerator<StreamChunk>
} {
  const listeners = new Set<(chunk: StreamChunk) => void>()
  const opened = {count: 0}
  return {
    stream: {
      push: (chunk) => {
        for (const listener of listeners) listener(chunk)
      },
      subscribeCount: () => opened.count,
    },
    subscribe: async function* (signal: AbortSignal): AsyncGenerator<StreamChunk> {
      opened.count += 1
      const queue: StreamChunk[] = [{type: EventType.MESSAGES_SNAPSHOT, messages: []}]
      const waiter = {wake: () => {}}
      const listener = (chunk: StreamChunk): void => {
        queue.push(chunk)
        waiter.wake()
      }
      listeners.add(listener)
      try {
        while (!signal.aborted) {
          const next = queue.shift()
          if (next !== undefined) {
            yield next
            continue
          }
          await new Promise<void>((resolve) => {
            waiter.wake = resolve
            signal.addEventListener('abort', () => resolve(), {once: true})
          })
        }
      } finally {
        listeners.delete(listener)
      }
    },
  }
}

export function makeFakeCoreRouter(): {router: ReturnType<typeof buildRouter>; stream: FakeCoreStream} {
  const {stream, subscribe} = makeStream()
  return {router: buildRouter(subscribe, stream), stream}
}

function buildRouter(subscribe: (signal: AbortSignal) => AsyncGenerator<StreamChunk>, stream: FakeCoreStream) {
  return {
    sessions: {
      list: os.sessions.list.handler(() => [sessionRow({id: 'conciv_1'})]),
      create: os.sessions.create.handler(() => ({sessionId: 'conciv_2'})),
      compact: os.sessions.compact.handler((): {ok: true} => ({ok: true})),
    },
    drafts: {
      get: os.drafts.get.handler(() => null),
      set: os.drafts.set.handler((): {ok: true} => ({ok: true})),
    },
    markers: {
      list: os.markers.list.handler(() => []),
    },
    meta: {
      models: os.meta.models.handler(() => ({
        models: [{id: 'model-1', name: 'Fable'}],
        defaultModel: 'model-1',
        harness: {id: 'claude', name: 'Claude', canLaunch: true, imageInput: false},
      })),
      commands: os.meta.commands.handler(() => ({commands: []})),
      tools: os.meta.tools.handler(() => ({tools: []})),
    },
    chat: {
      subscribe: os.chat.subscribe.handler(({signal}) => subscribe(signal ?? new AbortController().signal)),
      stop: os.chat.stop.handler((): {ok: true} => ({ok: true})),
      send: os.chat.send.handler((): {ok: true; runId: string} => {
        queueMicrotask(() => {
          stream.push({type: EventType.RUN_STARTED, threadId: 'conciv_1', runId: RUN_ID})
          stream.push({type: EventType.RUN_FINISHED, threadId: 'conciv_1', runId: RUN_ID})
        })
        return {ok: true, runId: RUN_ID}
      }),
    },
  }
}
