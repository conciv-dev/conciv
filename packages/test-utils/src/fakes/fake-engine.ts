import {contract, type DraftRow} from '@conciv/protocol'
import type {ModelMessage} from '@conciv/types/chat-message-types'
import {modelMessagesToUIMessages} from '@tanstack/ai-client'
import manifest from '../../package.json' with {type: 'json'}
import type {EngineConnection} from '@conciv/client'
import {aborted, channel} from './fake-channel.js'
import {createChat} from './fake-chat.js'
import {authHandlers, endLinks, fakeConnection, issueCode, type Access} from './fake-connection.js'
import {createPlugins} from './fake-plugins.js'
import {buildRouter, withSendRecorded} from './fake-router.js'
import {createSessions} from './fake-sessions.js'
import {createSettings} from './fake-settings.js'
import {createTabs} from './fake-tabs.js'
import type {
  FakeConnectOptions,
  FakeEngine,
  FakeEngineHandlers,
  FakeEngineOptions,
  FakeEngineReading,
} from './fake-types.js'

function isWireRow(value: unknown): value is ModelMessage & {readonly content: unknown} {
  return typeof value === 'object' && value !== null && 'role' in value && typeof value.role === 'string'
}

function isModelContent(content: unknown): content is ModelMessage['content'] {
  return content === null || typeof content === 'string' || Array.isArray(content)
}

function wireContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  return content.map((part: unknown) =>
    typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part
      ? {type: 'text', content: part.text}
      : part,
  )
}

function wireRow(value: unknown): ModelMessage[] {
  if (!isWireRow(value)) return []
  const content = wireContent(value.content)
  return [{...value, content: isModelContent(content) ? content : null}]
}

export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const directory = options.directory ?? '/workspace'
  const location = {directory}
  const unanswered: string[] = []
  const events = channel<{
    id: string
    type: string
    created: number
    data: Record<string, unknown>
    location: {directory: string}
  }>()
  const publish = (type: string, data: Record<string, unknown>): void => {
    if (type === 'session.deleted') tabs.forget(String(data['sessionID']))
    events.push({id: crypto.randomUUID(), type, created: Date.now(), data, location})
  }
  const store = createSessions(
    options.sessions ?? [],
    options.pastSessions ?? [],
    options.harnesses ?? [],
    directory,
    publish,
  )
  const chat = createChat(
    {
      sessions: store.sessions,
      history: store.history,
      touch: store.touch,
      now: store.now,
      setUsage: store.setUsage,
      addMarker: store.addCompactMarker,
    },
    options,
    (messages) => modelMessagesToUIMessages(messages.flatMap(wireRow)),
  )
  const tabs = createTabs({exists: (sessionId) => store.sessions.has(sessionId), now: store.now, publish})
  const plugins = createPlugins(options, location, unanswered, publish)
  const settings = createSettings(options.settings)
  const drafts = new Map<string, DraftRow>()
  const required = options.loggedIn === false ? (options.token ?? crypto.randomUUID()) : options.token
  const access: Access = {
    required,
    code: undefined,
    failures: 0,
    links: new Set(),
    connections: new Set(),
    up: undefined,
  }
  const reading: {engine: FakeEngineReading; version: string | null} = {
    engine: {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'fake'},
    version: manifest.version,
  }
  const builtins: FakeEngineHandlers = {
    auth: authHandlers(access),
    sessions: {...store.handlers, compact: ({sessionId}) => chat.compact(sessionId)},
    tabs: tabs.handlers,
    settings,
    drafts: {
      get: ({sessionId}) => drafts.get(sessionId) ?? null,
      set: (row) => {
        drafts.set(row.sessionId, row)
        return {ok: true}
      },
    },
    markers: {list: store.markers},
    chat: chat.handlers,
    registry: {catalog: () => []},
    meta: {
      ...store.meta,
      tools: () => ({tools: []}),
      project: () => ({name: null, root: directory, branch: null, instructions: null}),
      engine: () => ({...reading.engine, changed: [...reading.engine.changed], tracked: [...reading.engine.tracked]}),
      hubAgents: async function* (_input, call) {
        yield {installs: [], connections: []}
        if (call.signal !== undefined) await aborted(call.signal)
      },
    },
    skill: {list: () => ({location, data: []})},
    agent: {list: () => ({location, data: []})},
    fs: {find: () => ({location, data: []})},
    plugin: plugins.handlers,
    event: {
      subscribe: async function* (_input, call) {
        yield {id: crypto.randomUUID(), type: 'server.connected', data: {}}
        yield* events.read(call.signal)
      },
    },
  }
  const router = buildRouter(contract, [], [withSendRecorded(options.handlers, chat.recordSend), builtins], unanswered)
  const connect = (connectOptions: FakeConnectOptions = {}): EngineConnection => {
    const made = fakeConnection(router, access, () => reading.version, connectOptions)
    access.connections.add(made)
    return made.connection
  }
  const connection = connect({token: options.loggedIn === false ? undefined : (required ?? '')})
  const drop = (): void => {
    access.up ??= Promise.withResolvers<void>()
    access.connections.forEach((made) => made.reachable(false))
    endLinks(access)
  }
  const recover = (): void => {
    const down = access.up
    access.up = undefined
    down?.resolve()
    access.connections.forEach((made) => made.reachable(true))
  }
  return {
    apiBase: `http://engine-${crypto.randomUUID()}.fake.test`,
    directory,
    connection,
    connect,
    reply: (...replies) => chat.reply(replies),
    gate: () => chat.gate(),
    outside: (agent = {}) => chat.outside(agent),
    synthetic: (sessionId, notice) => chat.synthetic(sessionId, notice),
    setBundles: plugins.setBundles,
    emit: plugins.emit,
    drop,
    recover,
    reconnect: () => {
      drop()
      recover()
    },
    stale: (engine) => {
      reading.engine = engine
    },
    version: (version) => {
      reading.version = version
    },
    loginCode: () => access.code ?? issueCode(access),
    revokeBrowsers: () => {
      access.required = crypto.randomUUID()
      access.connections.forEach((made) => made.revoke())
      endLinks(access)
    },
    sent: () => chat.sent(),
    drafts: () => [...drafts.values()],
    unanswered: () => [...unanswered],
    dispose: () => {
      events.end()
      endLinks(access)
      access.connections.clear()
    },
  }
}
