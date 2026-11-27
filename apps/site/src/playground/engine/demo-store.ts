import {EventPublisher, ORPCError} from '@orpc/server'
import type {DraftRow, SessionMeta, SettingsSnapshot} from '@conciv/protocol'
import type {BrowserTab} from '@conciv/protocol/schema/browser-tab'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import {isSessionId, SessionId} from '@conciv/types/chat-types'
import type {EngineHandlers} from './demo-router'
import type {Publish} from './demo-events'
import {aborted} from './demo-time'

export const HARNESS_ID = 'playground'

function sessionNotFound(): never {
  throw new ORPCError('NOT_FOUND', {message: 'session not found'})
}

function makeSessionId(): SessionId {
  const id = `ses_${crypto.randomUUID().replaceAll('-', '')}`
  if (!isSessionId(id)) throw new Error(`the playground made a session id the schema refuses: ${id}`)
  return id
}

export function createSessions(title: string) {
  const sessions = new Map<string, SessionMeta>()
  const history = new Map<string, ChatMessage[]>()
  const drafts = new Map<string, DraftRow>()
  const changes = new EventPublisher<{version: {version: number}}>()
  const version = {current: 0}
  const touch = (): void => {
    version.current += 1
    changes.publish('version', {version: version.current})
  }
  const create = (): {sessionId: SessionId; session: SessionMeta} => {
    const session: SessionMeta = {
      id: makeSessionId(),
      title,
      updatedAt: Date.now(),
      running: false,
      origin: 'conciv',
      usage: null,
      model: null,
      effort: null,
      hidden: false,
      native: null,
      harnessKind: HARNESS_ID,
      lastRunAt: null,
    }
    sessions.set(session.id, session)
    history.set(session.id, [])
    touch()
    return {sessionId: session.id, session}
  }
  const found = (sessionId: string): SessionMeta => sessions.get(sessionId) ?? sessionNotFound()
  const update = (sessionId: string, patch: Partial<SessionMeta>): SessionMeta => {
    const next = {...found(sessionId), ...patch}
    sessions.set(sessionId, next)
    touch()
    return next
  }
  const listed = (): SessionMeta[] =>
    [...sessions.values()]
      .filter((session) => !session.hidden)
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
  const saveMessage = (sessionId: string, message: ChatMessage): void => {
    const saved = history.get(sessionId) ?? []
    const index = saved.findIndex((known) => known.id === message.id)
    history.set(sessionId, index < 0 ? [...saved, message] : saved.with(index, message))
  }
  const handlers: EngineHandlers['sessions'] = {
    list: ({limit}) => ({sessions: listed().slice(0, limit), next: null}),
    search: ({term, limit}) => ({
      sessions: listed()
        .filter((session) => session.title.toLowerCase().includes(term.toLowerCase()))
        .slice(0, limit)
        .map((session) => ({...session, excerpt: null, matched: [term], cwd: null, resume: null, preview: null})),
      next: null,
    }),
    changes: async function* (_input, call) {
      yield {version: version.current}
      yield* changes.subscribe('version', {signal: call.signal})
    },
    get: ({sessionId}) => found(sessionId),
    preview: () => ({messages: [], earlier: null}),
    create: () => create(),
    resolve: ({id}) => {
      const known = id === undefined ? listed()[0] : sessions.get(id)
      if (known !== undefined) return {sessionId: known.id}
      if (id !== undefined) return sessionNotFound()
      return {sessionId: create().sessionId}
    },
    rename: ({sessionId, title}) => ({title: update(sessionId, {title, updatedAt: Date.now()}).title}),
    delete: ({sessionId}) => {
      update(sessionId, {hidden: true})
      return {ok: true}
    },
    model: ({sessionId, model}) => ({model: update(sessionId, {model}).model ?? model}),
    effort: ({sessionId, effort}) => ({effort: update(sessionId, {effort}).effort}),
  }
  return {
    handlers,
    history,
    saveMessage,
    touch,
    setRunning: (sessionId: string, running: boolean): void => {
      if (!sessions.has(sessionId)) return
      update(sessionId, {running, updatedAt: Date.now(), lastRunAt: Date.now()})
    },
    drafts: {
      get: ({sessionId}: {sessionId: string}) => drafts.get(sessionId) ?? null,
      set: (row: DraftRow) => {
        drafts.set(row.sessionId, row)
        return {ok: true as const}
      },
    },
  }
}

export function createSettings(): EngineHandlers['settings'] {
  const snapshots = new Map<string, SettingsSnapshot>()
  const changes = new EventPublisher<{changed: {key: string; snapshot: SettingsSnapshot}}>()
  const settingsKey = (input: {scope: string; namespace: string}): string => `${input.scope}:${input.namespace}`
  const read = (input: {scope: string; namespace: string}): SettingsSnapshot => {
    const known = snapshots.get(settingsKey(input)) ?? {generation: 'playground', version: 0, value: {}}
    snapshots.set(settingsKey(input), known)
    return known
  }
  const write = (input: {scope: string; namespace: string}, value: Record<string, unknown>): SettingsSnapshot => {
    const snapshot = {generation: 'playground', version: read(input).version + 1, value}
    snapshots.set(settingsKey(input), snapshot)
    changes.publish('changed', {key: settingsKey(input), snapshot})
    return snapshot
  }
  return {
    all: (input) => read(input),
    set: (input) => write(input, {...read(input).value, [input.key]: input.value}),
    delete: (input) => {
      const {[input.key]: _removed, ...kept} = read(input).value
      return write(input, kept)
    },
    changes: async function* (input, call) {
      yield read(input)
      for await (const change of changes.subscribe('changed', {signal: call.signal}))
        if (change.key === settingsKey(input)) yield change.snapshot
    },
  }
}

type OpenTab = {readonly sessionId: string; readonly connectionId: string; readonly tab: BrowserTab}

export function createTabs(exists: (sessionId: string) => boolean, publish: Publish): EngineHandlers['tabs'] {
  const open = new Map<string, OpenTab>()
  const changes = new EventPublisher<{version: {version: number}}>()
  const version = {current: 0}
  const changed = (type: string, data: Record<string, unknown>): void => {
    publish(type, data)
    version.current += 1
    changes.publish('version', {version: version.current})
  }
  const list = (sessionId: string) => {
    const tabs = [...open.values()].filter((entry) => entry.sessionId === sessionId).map((entry) => entry.tab)
    return {tabs, focusedTabId: tabs.find((tab) => tab.focused)?.id ?? null}
  }
  return {
    open: async (request, call) => {
      if (!exists(request.sessionId)) throw new ORPCError('NOT_FOUND', {message: 'session not found'})
      const entry: OpenTab = {sessionId: request.sessionId, connectionId: request.connectionId, tab: request.tab}
      open.set(request.tab.id, entry)
      changed('tab.opened', {
        sessionID: request.sessionId,
        tabId: request.tab.id,
        connectionId: request.connectionId,
        tab: request.tab,
      })
      await aborted(call.signal)
      if (open.get(request.tab.id) === entry) {
        open.delete(request.tab.id)
        changed('tab.closed', {sessionID: request.sessionId, tabId: request.tab.id, connectionId: request.connectionId})
      }
      return 'closed' as const
    },
    state: (request) => {
      const entry = open.get(request.tab.id)
      if (entry === undefined || entry.sessionId !== request.sessionId)
        throw new ORPCError('UNAVAILABLE', {message: 'The browser tab is not open on this engine.'})
      open.set(request.tab.id, {...entry, tab: request.tab})
      changed('tab.updated', {sessionID: request.sessionId, tabId: request.tab.id, tab: request.tab})
      return {ok: true}
    },
    list: ({sessionId}) => list(sessionId),
    sessions: () => [...new Set([...open.values()].map((entry) => SessionId.parse(entry.sessionId)))],
    changes: async function* (_request, call) {
      yield {version: version.current}
      yield* changes.subscribe('version', {signal: call.signal})
    },
  }
}
