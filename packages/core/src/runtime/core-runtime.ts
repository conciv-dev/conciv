import {eq, lt} from 'drizzle-orm'
import type {SessionId, NavigationWrite} from '@conciv/protocol/chat-types'
import type {RawFrame} from '../editor/symbolicate.js'
import type {EngineStaleness, ToolCommandSignature} from '@conciv/contract'
import type {ToolRequest} from '@conciv/extension'
import {navigation, sessionCaptures, writeToolCapture} from '@conciv/db'
import {symbolicateFrames} from '../editor/symbolicate.js'
import {sessionSnapshot} from '../chat/transcript.js'
import {stopSession} from '../chat/stop.js'
import type {ChatDeps} from '../chat/runtime.js'
import type {Compactor, Send} from '../chat/run.js'
import {pageQueryStream} from '../page-bus.js'
import {askUi} from '../chat/ask.js'
import {subscribeSession} from '../chat/subscribe.js'
import type {SessionPrimitives} from './primitives.js'
import {runWithSession} from './session-context.js'
import type {CoreRuntime, EngineScope, SessionScope} from './scope-types.js'

const MAX_NAVIGATION_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export type CoreRuntimeDeps = {
  primitives: SessionPrimitives
  chat: ChatDeps
  send: Send
  compactor: Compactor
  model: (sessionId: SessionId) => string | null
  staleness: () => EngineStaleness
}

function catalogSignatures(primitives: SessionPrimitives): ToolCommandSignature[] {
  return primitives.registry.catalog.list().map((entry) => {
    const signature = primitives.registry.catalog.get(entry.name)
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
      mirrors: signature.mirrors,
      reachable: entry.reachable,
      approval: signature.approval,
      inputSchema: signature.inputSchema,
      outputSchema: signature.outputSchema,
      errors: signature.errors,
    }
  })
}

function makeEngineScope(deps: CoreRuntimeDeps): EngineScope {
  const db = deps.chat.db
  return {
    catalog: () => catalogSignatures(deps.primitives),
    staleness: deps.staleness,
    symbolicate: (frames: RawFrame[]) => symbolicateFrames(frames, deps.primitives.page.root),
    navigation: {
      get: async () => {
        const rows = await db.select().from(navigation).where(eq(navigation.id, 'navigation'))
        const row = rows[0]
        return row ? {entries: row.entries, index: row.index, updatedAt: row.updatedAt} : null
      },
      set: async (write: NavigationWrite) => {
        if (write.updatedAt > Date.now() + MAX_NAVIGATION_CLOCK_SKEW_MS) return {ok: true as const, applied: false}
        const row = {id: 'navigation', entries: write.entries, index: write.index, updatedAt: write.updatedAt}
        const result = await db
          .insert(navigation)
          .values(row)
          .onConflictDoUpdate({target: navigation.id, set: row, setWhere: lt(navigation.updatedAt, write.updatedAt)})
        return {ok: true as const, applied: Number(result.changes) > 0}
      },
    },
  }
}

function makeSessionScope(deps: CoreRuntimeDeps, id: SessionId): SessionScope {
  const {asks, liveRuns, page, registry, stream} = deps.primitives
  const model = deps.model(id)
  const requestFor = (toolCallId: string | undefined): ToolRequest =>
    toolCallId === undefined ? {sessionId: id, model} : {sessionId: id, model, toolCallId}
  return {
    id,
    model,
    tools: {
      call: (name, input, options) => registry.call(name, input, {request: requestFor(options?.toolCallId)}),
      has: (name) => registry.has(name),
      catalog: registry.catalog,
    },
    page: {
      ask: async (name, input) => (await page.bus.ask(id, {name, input})).result,
      queries: (signal) => pageQueryStream(page.bus, id, signal),
      reply: (requestId, outcome) => page.bus.resolve(id, requestId, outcome),
      connected: () => page.bus.connected(id),
      changes: () => page.journal.list(id),
      clearChanges: () => page.journal.clear(id),
    },
    stream: {
      publish: (chunk) => stream.publish(id, chunk),
      listen: (onChunk) => stream.listen(id, onChunk),
      listening: () => stream.listening(id),
      subscribe: (signal) => subscribeSession(deps.chat, id, signal),
    },
    asks: {
      open: (key) => asks.open(id, key),
      pending: () => asks.pending(id),
      reply: (key, value) => asks.reply(id, key, value),
      waitFor: (key, timeoutMs) => asks.waitFor(id, key, timeoutMs),
      cancel: () => asks.cancel(id),
      noteToolCall: (toolCallId, toolName) => asks.noteToolCall(id, toolCallId, toolName),
      nextUiCall: (timeoutMs) => asks.nextUiCall(id, timeoutMs),
      ui: () => askUi(asks, id),
    },
    captures: {
      list: () => sessionCaptures(deps.chat.db, id),
      store: (toolCallId, bundle) => writeToolCapture(deps.chat.db, {sessionId: id, toolCallId, bundle}),
    },
    history: {
      messages: () => sessionSnapshot(deps.chat, id),
    },
    run: {
      send: (runId, content) => deps.send(id, runId, content),
      stop: () => stopSession(deps.chat, id),
      compact: () => deps.compactor.run(id),
      live: () => liveRuns.running(id),
    },
  }
}

function established(raw: SessionScope): SessionScope {
  const scope: SessionScope = {
    ...raw,
    tools: {
      ...raw.tools,
      call: (name, input, options) => runWithSession(scope, () => raw.tools.call(name, input, options)),
    },
    page: {...raw.page, ask: (name, input) => runWithSession(scope, () => raw.page.ask(name, input))},
    captures: {
      ...raw.captures,
      store: (toolCallId, bundle) => runWithSession(scope, () => raw.captures.store(toolCallId, bundle)),
    },
    run: {
      send: (runId, content) => runWithSession(scope, () => raw.run.send(runId, content)),
      stop: () => runWithSession(scope, () => raw.run.stop()),
      compact: () => runWithSession(scope, () => raw.run.compact()),
      live: raw.run.live,
    },
  }
  return scope
}

export function makeCoreRuntime(deps: CoreRuntimeDeps): CoreRuntime {
  const engine = makeEngineScope(deps)
  return {forSession: (id) => established(makeSessionScope(deps, id)), engine}
}
