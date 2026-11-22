import {Effect} from 'effect'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {EngineStaleness, RawFrame, SourceLoc} from '@conciv/contract'
import type {ChatPlane} from '@conciv/chat'
import {sessionRunEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {Log} from '../lib/logging.js'
import type {SessionPrimitives} from './primitives.js'
import type {CoreRuntime, EngineScope, SessionScope} from './scope-types.js'

export type CoreRuntimeDeps = {
  primitives: SessionPrimitives
  plane: ChatPlane
  model: (sessionId: SessionId) => Promise<string | null>
  staleness: () => EngineStaleness
  interruptIdle: (sessionId: SessionId, stopped: boolean) => Promise<boolean>
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>
  log: Log
}

function makeEngineScope(deps: CoreRuntimeDeps): EngineScope {
  return {
    staleness: deps.staleness,
    symbolicate: deps.symbolicate,
  }
}

function makeSessionScope(deps: CoreRuntimeDeps, id: SessionId): SessionScope {
  const {stream} = deps.primitives
  return {
    id,
    stream: {
      publish: (chunk) => stream.publish(id, chunk),
      listen: (onChunk) => stream.listen(id, onChunk),
      events: (signal) => caughtUpThenLive(stream.events(id, signal), () => deps.plane.catchUp(id), deps.log),
    },
    asks: {ui: () => deps.plane.askUi(id)},
    history: {
      messages: () => deps.plane.history(id),
      hydrate: (window) => deps.plane.hydrate(id, window),
    },
    run: {
      stop: async (runIds) => {
        const {stopped} = await deps.plane.stop(id, runIds)
        const interrupted = await deps.interruptIdle(id, stopped)
        return {ok: true, stopped: stopped || interrupted}
      },
      compact: async () => {
        await deps.interruptIdle(id, true)
        await deps.plane.compact(id)
      },
      live: () => deps.plane.live(id),
      record: (chunks) => deps.plane.record(id, chunks),
    },
  }
}

async function* caughtUpThenLive(
  live: AsyncGenerator<ChatEvent>,
  missed: () => Promise<ChatEvent[]>,
  log: Log,
): AsyncGenerator<ChatEvent> {
  const first = live.next()
  const caught = await missed().catch((error: unknown): ChatEvent[] => {
    log(Effect.logError('[core] reading what a new subscriber missed failed', {error}))
    return []
  })
  yield* caught
  const opened = await first
  if (opened.done === true) return
  if (!announcedAgain(opened.value, caught)) yield opened.value
  yield* live
}

function announcedAgain(event: ChatEvent, caught: ChatEvent[]): boolean {
  const runId = sessionRunEvent.parse(event)?.runId
  return runId !== undefined && caught.some((missed) => sessionRunEvent.parse(missed)?.runId === runId)
}

export function makeCoreRuntime(deps: CoreRuntimeDeps): CoreRuntime {
  const engine = makeEngineScope(deps)
  return {forSession: (id) => makeSessionScope(deps, id), engine}
}
