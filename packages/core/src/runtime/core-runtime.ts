import {eq, lt} from 'drizzle-orm'
import {Effect} from 'effect'
import type {SessionId, NavigationWrite} from '@conciv/protocol/chat-types'
import type {EngineStaleness, RawFrame, SourceLoc} from '@conciv/contract'
import {navigation, type ConcivDb} from '@conciv/db'
import type {ChatPlane} from '@conciv/chat'
import {sessionRunEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {logError} from '../lib/debug.js'
import type {SessionPrimitives} from './primitives.js'
import type {CoreRuntime, EngineScope, SessionScope} from './scope-types.js'

const MAX_NAVIGATION_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export type CoreRuntimeDeps = {
  primitives: SessionPrimitives
  plane: ChatPlane
  db: ConcivDb
  model: (sessionId: SessionId) => Promise<string | null>
  staleness: () => EngineStaleness
  interruptIdle: (sessionId: SessionId, stopped: boolean) => Promise<boolean>
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>
}

function makeEngineScope(deps: CoreRuntimeDeps): EngineScope {
  const db = deps.db
  return {
    staleness: deps.staleness,
    symbolicate: deps.symbolicate,
    navigation: {
      get: async () => {
        const rows = await Effect.runPromise(db.select().from(navigation).where(eq(navigation.id, 'navigation')))
        const row = rows[0]
        return row ? {entries: row.entries, index: row.index, updatedAt: row.updatedAt} : null
      },
      set: async (write: NavigationWrite) => {
        if (write.updatedAt > Date.now() + MAX_NAVIGATION_CLOCK_SKEW_MS) return {ok: true as const, applied: false}
        const row = {id: 'navigation', entries: write.entries, index: write.index, updatedAt: write.updatedAt}
        const result = await Effect.runPromise(
          db
            .insert(navigation)
            .values(row)
            .onConflictDoUpdate({target: navigation.id, set: row, setWhere: lt(navigation.updatedAt, write.updatedAt)}),
        )
        return {ok: true as const, applied: Number(result.changes) > 0}
      },
    },
  }
}

function makeSessionScope(deps: CoreRuntimeDeps, id: SessionId): SessionScope {
  const {stream} = deps.primitives
  return {
    id,
    stream: {
      publish: (chunk) => stream.publish(id, chunk),
      listen: (onChunk) => stream.listen(id, onChunk),
      events: (signal) => caughtUpThenLive(stream.events(id, signal), () => deps.plane.catchUp(id)),
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
): AsyncGenerator<ChatEvent> {
  const first = live.next()
  const caught = await missed().catch((error: unknown): ChatEvent[] => {
    logError(`[core] reading what a new subscriber missed failed: ${String(error)}`)
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
