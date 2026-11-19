import {eq, lt} from 'drizzle-orm'
import {Effect} from 'effect'
import type {SessionId, NavigationWrite} from '@conciv/protocol/chat-types'
import type {EngineStaleness, RawFrame, SourceLoc, ToolCommandSignature} from '@conciv/contract'
import type {ToolRequest} from '@conciv/protocol/tool-call-types'
import {navigation, sessionCaptures, writeToolCapture, type ConcivDb} from '@conciv/db'
import type {ChatPlane} from '@conciv/chat'
import {sessionRunEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {logError} from '../lib/debug.js'
import {pageQueryStream} from '../page/page-bus.js'
import type {SessionPrimitives} from './primitives.js'
import {runWithSession} from './session-context.js'
import type {CoreRuntime, EngineScope, SessionScope, ToolCatalog} from './scope-types.js'

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

function catalogSignatures(catalog: ToolCatalog): ToolCommandSignature[] {
  return catalog.list().map((entry) => {
    const signature = catalog.get(entry.name)
    return {
      name: entry.name,
      path: [...entry.path],
      binding: entry.binding,
      summary: entry.summary,
      category: entry.category,
      hint: entry.hint,
      positional: signature.positional,
      icon: entry.icon,
      label: entry.label,
      mutating: signature.mutating,
      reachable: entry.reachable,
      approval: signature.approval,
      inputSchema: signature.inputSchema,
      outputSchema: signature.outputSchema,
      errors: signature.errors,
    }
  })
}

function makeEngineScope(deps: CoreRuntimeDeps): EngineScope {
  const db = deps.db
  return {
    catalog: () => catalogSignatures(deps.primitives.registry.catalog),
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
  const {page, registry, stream} = deps.primitives
  const view = registry.whenPageConnected(() => page.bus.connected(id))
  const agentId: string = id
  const requestFor = async (options: {toolCallId?: string; signal?: AbortSignal} = {}): Promise<ToolRequest> => ({
    sessionId: id,
    agentId,
    model: await deps.model(id),
    ...(options.toolCallId === undefined ? {} : {toolCallId: options.toolCallId}),
    ...(options.signal === undefined ? {} : {signal: options.signal}),
  })
  return {
    id,
    tools: {
      call: async (name, input, options) =>
        registry.call(name, input, {
          request: await requestFor(options),
          ...(options?.gate === undefined ? {} : {gate: options.gate}),
        }),
      has: (name) => registry.has(name),
      catalog: view.catalog,
    },
    page: {
      ask: async (name, input) => (await page.bus.ask(id, {name, input, agentId})).result,
      queries: (signal, focus) => pageQueryStream(page.bus, id, signal, focus),
      focus: (browserTab, report) => page.bus.focus(id, browserTab, report),
      reply: (requestId, outcome) => page.bus.resolve(id, requestId, outcome),
      connected: () => page.bus.connected(id),
      changes: () => page.journal.list(id),
      clearChanges: () => page.journal.clear(id),
    },
    stream: {
      publish: (chunk) => stream.publish(id, chunk),
      listen: (onChunk) => stream.listen(id, onChunk),
      events: (signal) => caughtUpThenLive(stream.events(id, signal), () => deps.plane.catchUp(id)),
    },
    asks: {ui: () => deps.plane.askUi(id)},
    captures: {
      list: () => sessionCaptures(deps.db, id),
      store: (toolCallId, bundle) => writeToolCapture(deps.db, {sessionId: id, toolCallId, bundle}),
    },
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

function established(raw: SessionScope): SessionScope {
  const inScope = <Args extends unknown[], Result>(effect: (...args: Args) => Result): ((...args: Args) => Result) => {
    return (...args) => runWithSession(scope, () => effect(...args))
  }
  const scope: SessionScope = {
    ...raw,
    tools: {...raw.tools, call: inScope(raw.tools.call)},
    page: {
      ...raw.page,
      ask: inScope(raw.page.ask),
      queries: inScope(raw.page.queries),
      focus: inScope(raw.page.focus),
      reply: inScope(raw.page.reply),
      changes: inScope(raw.page.changes),
      clearChanges: inScope(raw.page.clearChanges),
    },
    stream: {
      ...raw.stream,
      publish: inScope(raw.stream.publish),
      listen: inScope(raw.stream.listen),
      events: inScope(raw.stream.events),
    },
    asks: {ui: inScope(raw.asks.ui)},
    captures: {list: inScope(raw.captures.list), store: inScope(raw.captures.store)},
    history: {messages: inScope(raw.history.messages), hydrate: inScope(raw.history.hydrate)},
    run: {
      stop: inScope(raw.run.stop),
      compact: inScope(raw.run.compact),
      live: raw.run.live,
      record: inScope(raw.run.record),
    },
  }
  return scope
}

export function makeCoreRuntime(deps: CoreRuntimeDeps): CoreRuntime {
  const engine = makeEngineScope(deps)
  return {forSession: (id) => established(makeSessionScope(deps, id)), engine}
}
