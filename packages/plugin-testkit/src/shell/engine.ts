import {onTestFinished} from 'vitest'
import {commands} from 'vitest/browser'
import {ORPCError} from '@orpc/client'
import type {EngineEvent, EngineFailure, EngineStartOptions} from '../browser-commands.js'
import type {ShellEngine} from './client.js'

export interface EngineTool {
  call(input?: unknown): Promise<unknown>
  answer(input?: unknown): Promise<{readonly output: unknown; readonly content: unknown}>
  failure(input?: unknown): Promise<{readonly tool: string; readonly message: string}>
}

export interface EngineWait {
  readonly arrived: Promise<EngineEvent>
}

export interface TestEngine extends ShellEngine {
  readonly id: string
  failure(rpcId: string, method: string, input?: unknown): Promise<EngineFailure>
  tool(name: string): EngineTool
  write(path: string, content: string): Promise<string>
  event(type: string): Promise<EngineWait>
}

function rpcError(failure: EngineFailure): ORPCError<string, EngineFailure> {
  const internal = failure.type === 'rpc.internal' || failure.type === 'rpc.invalid_output'
  return new ORPCError(internal ? 'PLUGIN_RPC_INTERNAL' : 'PLUGIN_RPC', {
    status: internal ? 500 : 400,
    message: failure.message,
    data: failure,
  })
}

async function* engineEvents(engineId: string, signal: AbortSignal): AsyncGenerator<EngineEvent> {
  const feedId = await commands.concivPluginEngineEventsOpen(engineId)
  const close = () => void commands.concivPluginEngineEventsClose(engineId, feedId)
  signal.addEventListener('abort', close, {once: true})
  try {
    while (!signal.aborted) {
      const event = await commands.concivPluginEngineEventsNext(engineId, feedId)
      if (event === undefined) return
      yield event
    }
  } finally {
    signal.removeEventListener('abort', close)
    close()
  }
}

async function firstEvent(
  feed: AsyncGenerator<EngineEvent>,
  type: string,
  controller: AbortController,
): Promise<EngineEvent> {
  for await (const event of feed) {
    if (event.type !== type) continue
    controller.abort()
    return event
  }
  throw new Error(`the engine stopped before an event ${type} arrived`)
}

export async function pluginEngine(options: EngineStartOptions = {}): Promise<TestEngine> {
  const started = await commands.concivPluginEngineStart(options)
  onTestFinished(() => commands.concivPluginEngineStop(started.id))
  const call = async (rpcId: string, method: string, input?: unknown) => {
    const outcome = await commands.concivPluginEngineCall(started.id, rpcId, method, input)
    if (outcome.ok) return outcome.value
    throw rpcError(outcome.failure)
  }
  const failure = async (rpcId: string, method: string, input?: unknown) => {
    const outcome = await commands.concivPluginEngineCall(started.id, rpcId, method, input)
    if (outcome.ok) throw new Error(`the rpc ${rpcId}.${method} answered instead of failing`)
    return outcome.failure
  }
  const events = (signal: AbortSignal) => engineEvents(started.id, signal)
  return {
    id: started.id,
    sessionId: started.sessionId,
    directory: started.directory,
    call,
    failure,
    tool: (name) => ({
      call: async (input = {}) => {
        const answer = await commands.concivPluginEngineTool(started.id, started.sessionId, name, input)
        return answer.output ?? answer.content
      },
      answer: (input = {}) => commands.concivPluginEngineTool(started.id, started.sessionId, name, input),
      failure: (input = {}) => commands.concivPluginEngineToolFailure(started.id, started.sessionId, name, input),
    }),
    write: (path, content) => commands.concivPluginEngineWrite(started.id, path, content),
    event: async (type) => {
      const controller = new AbortController()
      onTestFinished(() => controller.abort())
      const feed = events(controller.signal)
      await feed.next()
      return {arrived: firstEvent(feed, type, controller)}
    },
    events,
  }
}
