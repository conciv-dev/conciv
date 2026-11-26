import {ORPCError} from '@orpc/server'
import type {MarkerRow, SessionHit, SessionMeta} from '@conciv/protocol'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import {HarnessSessionId, isSessionId, SessionId, type NativeSessionRef} from '@conciv/types/chat-types'
import type {UsageSnapshot} from '@conciv/types/usage-types'
import {channel} from './fake-channel.js'
import type {Call, FakeHarness, FakePastSession, FakeSession} from './fake-types.js'

type Publish = (type: string, data: Record<string, unknown>) => void

type Cursor = {readonly updatedAt: number; readonly id: string} | null | undefined

const DEFAULT_HARNESS: FakeHarness = {
  models: [{id: 'fake-model', name: 'Fake model'}],
  defaultModel: 'fake-model',
  modelsFailed: false,
  harness: {id: 'fake', name: 'Fake harness', imageInput: false, persistentPty: false},
  login: {loggedIn: true},
}

function sessionNotFound(): never {
  throw new ORPCError('NOT_FOUND', {message: 'session not found'})
}

function makeSessionId(): SessionId {
  const id = `ses_${crypto.randomUUID().replaceAll('-', '')}`
  if (!isSessionId(id)) throw new Error(`the fake engine made a session id the schema refuses: ${id}`)
  return id
}

function byNewest<Row extends {readonly updatedAt: number}>(rows: readonly Row[]): Row[] {
  return rows.toSorted((left, right) => right.updatedAt - left.updatedAt)
}

function page<Row extends {readonly id: string; readonly updatedAt: number}>(
  rows: readonly Row[],
  cursor: Cursor,
  limit: number,
) {
  const start = cursor === null || cursor === undefined ? 0 : rows.findIndex((row) => row.id === cursor.id) + 1
  const sessions = rows.slice(start, start + limit)
  const last = sessions.at(-1)
  const more = start + limit < rows.length
  return {sessions, next: more && last !== undefined ? {updatedAt: last.updatedAt, id: last.id} : null}
}

function previewPage(messages: readonly ChatMessage[], before: string | null, limit: number) {
  const end = before === null ? messages.length : messages.findIndex((message) => message.id === before)
  const start = Math.max(0, end - limit)
  return {messages: messages.slice(start, end), earlier: start === 0 ? null : (messages[start]?.id ?? null)}
}

function messageText(message: ChatMessage): string {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
}

function hitFields(session: SessionMeta, term: string): SessionHit {
  return {...session, excerpt: null, matched: [term], cwd: null, resume: null, preview: null}
}

export function createSessions(
  initial: readonly FakeSession[],
  past: readonly FakePastSession[],
  harnesses: readonly FakeHarness[],
  directory: string,
  publish: Publish,
) {
  const defaultHarness = harnesses[0] ?? DEFAULT_HARNESS
  const sessions = new Map<string, SessionMeta>()
  const history = new Map<string, ChatMessage[]>()
  const markers: MarkerRow[] = []
  const changes = channel<{version: number}>()
  const version = {current: 0}
  const clock = {last: 0}
  const now = (): number => {
    clock.last = Math.max(Date.now(), clock.last + 1)
    return clock.last
  }
  const meta = (session: FakeSession, updatedAt: number): SessionMeta => ({
    id: SessionId.parse(session.id),
    title: session.title ?? 'New session',
    updatedAt,
    running: false,
    origin: 'conciv',
    usage: null,
    model: null,
    effort: null,
    hidden: false,
    native: null,
    harnessKind: defaultHarness.harness.id,
    lastRunAt: null,
  })
  const nativeRef = (session: FakePastSession): NativeSessionRef => ({
    harnessKind: defaultHarness.harness.id,
    cwd: session.cwd ?? directory,
    nativeId: HarnessSessionId.parse(session.nativeId),
  })
  const pastRow = (session: FakePastSession): SessionMeta => ({
    ...meta({id: `ses_${session.nativeId}`, title: session.title}, session.updatedAt),
    origin: 'external',
    native: nativeRef(session),
  })
  const here = past.filter((session) => session.cwd === undefined || session.cwd === directory)
  const pastHit = (session: FakePastSession, term: string): SessionHit[] => {
    const needle = term.toLowerCase()
    const excerpt = session.messages.map(messageText).find((text) => text.toLowerCase().includes(needle)) ?? null
    if (excerpt === null && !session.title.toLowerCase().includes(needle)) return []
    const elsewhere = session.cwd !== undefined && session.cwd !== directory
    return [
      {
        ...pastRow(session),
        excerpt,
        matched: [term],
        cwd: elsewhere ? (session.cwd ?? null) : null,
        resume: elsewhere ? `cd ${session.cwd} && claude --resume ${session.nativeId}` : null,
        preview: elsewhere ? nativeRef(session) : null,
      },
    ]
  }
  const opened = now()
  initial.forEach((session, index) => {
    sessions.set(session.id, meta(session, opened - index))
    history.set(session.id, [...(session.messages ?? [])])
  })
  const touch = (): void => {
    version.current += 1
    changes.push({version: version.current})
  }
  const found = (sessionId: string): SessionMeta => sessions.get(sessionId) ?? sessionNotFound()
  const update = (sessionId: string, patch: Partial<SessionMeta>): SessionMeta => {
    const next = {...found(sessionId), ...patch}
    sessions.set(sessionId, next)
    touch()
    return next
  }
  const addMarker = (sessionId: string, afterMessageId: string | null, kind: MarkerRow['kind']): void => {
    markers.push({id: `mrk_${crypto.randomUUID()}`, sessionId: SessionId.parse(sessionId), afterMessageId, kind})
  }
  const create = (id: SessionId = makeSessionId()): {sessionId: SessionId; session: SessionMeta} => {
    const made = meta({id}, now())
    sessions.set(made.id, made)
    history.set(made.id, [])
    addMarker(made.id, null, 'new')
    touch()
    return {sessionId: made.id, session: made}
  }
  const listed = (includeHidden: boolean | undefined): SessionMeta[] =>
    byNewest([...sessions.values()].filter((session) => includeHidden === true || !session.hidden))
  const harnessFor = (sessionId: string): FakeHarness => {
    const kind = sessions.get(sessionId)?.harnessKind
    return harnesses.find((harness) => harness.harness.id === kind) ?? defaultHarness
  }
  return {
    sessions,
    history,
    touch,
    now,
    setUsage: (sessionId: string, usage: UsageSnapshot) => {
      if (sessions.has(sessionId)) update(sessionId, {usage})
    },
    addCompactMarker: (sessionId: string, afterMessageId: string | null) =>
      addMarker(sessionId, afterMessageId, 'compact'),
    markers: ({sessionId}: {sessionId: string}) => markers.filter((marker) => marker.sessionId === sessionId),
    meta: {
      models: ({sessionId}: {sessionId: string}) => {
        const {commands: _commands, ...models} = harnessFor(sessionId)
        return models
      },
      harnesses: () => ({
        harnesses: (harnesses.length === 0 ? [defaultHarness] : harnesses).map((harness) => ({
          ...harness.harness,
          models: harness.models,
          defaultModel: harness.defaultModel,
          modelsFailed: harness.modelsFailed,
          login: harness.login,
        })),
        defaultHarness: defaultHarness.harness.id,
      }),
      commands: ({sessionId}: {sessionId: string}) => ({commands: [...(harnessFor(sessionId).commands ?? [])]}),
    },
    handlers: {
      list: (input: {includeHidden?: boolean | undefined; cursor?: Cursor; limit: number}) =>
        page(byNewest([...listed(input.includeHidden), ...here.map(pastRow)]), input.cursor, input.limit),
      search: (input: {term: string; cursor?: Cursor; limit: number; everywhere: boolean}) => {
        const needle = input.term.toLowerCase()
        const concivHits = listed(false)
          .filter((session) => session.title.toLowerCase().includes(needle))
          .map((session) => hitFields(session, input.term))
        const pastHits = (input.everywhere ? past : here).flatMap((session) => pastHit(session, input.term))
        return page(byNewest([...concivHits, ...pastHits]), input.cursor, input.limit)
      },
      changes: async function* (_input: unknown, call: Call) {
        yield {version: version.current}
        yield* changes.read(call.signal)
      },
      get: ({sessionId}: {sessionId: string}) => found(sessionId),
      preview: (input: {before: string | null; limit: number} & ({sessionId: string} | {nativeId: string})) => {
        const messages =
          'sessionId' in input
            ? (history.get(input.sessionId) ?? [])
            : (past.find((session) => session.nativeId === input.nativeId)?.messages ?? [])
        return previewPage(messages, input.before, input.limit)
      },
      create: () => create(),
      resolve: ({id}: {id?: string | undefined}) => {
        const known = id === undefined ? listed(false)[0] : sessions.get(id)
        if (known?.hidden === true) return sessionNotFound()
        if (known !== undefined) return {sessionId: known.id}
        if (id === undefined) return {sessionId: create().sessionId}
        if (!isSessionId(id)) return sessionNotFound()
        return {sessionId: create(id).sessionId}
      },
      rename: ({sessionId, title}: {sessionId: string; title: string}) => {
        const renamed = update(sessionId, {title, updatedAt: now()}).title
        publish('session.renamed', {sessionID: sessionId, title: renamed})
        return {title: renamed}
      },
      delete: ({sessionId}: {sessionId: string}) => {
        update(sessionId, {hidden: true, updatedAt: now()})
        publish('session.deleted', {sessionID: sessionId})
        return {ok: true as const}
      },
      model: ({sessionId, model}: {sessionId: string; model: string}) => ({
        model: update(sessionId, {model}).model ?? model,
      }),
      effort: ({sessionId, effort}: {sessionId: string; effort: SessionMeta['effort']}) => ({
        effort: update(sessionId, {effort}).effort,
      }),
      switchHarness: ({
        sessionId,
        harnessId,
        model,
      }: {
        sessionId: string
        harnessId: string
        model?: string | undefined
      }) => {
        update(sessionId, model === undefined ? {harnessKind: harnessId} : {harnessKind: harnessId, model})
        return {harnessId}
      },
    },
  }
}
