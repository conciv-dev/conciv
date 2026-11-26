import {createORPCClient, ORPCError} from '@orpc/client'
import {onTestFinished} from 'vitest'
import type {RpcClient} from '@conciv/client'
import {createFakeEngine, type FakeEngine, type FakeEngineHandlers} from '@conciv/client/testing'
import type {SessionHit, SessionMeta} from '@conciv/protocol'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import type {UsageSnapshot} from '@conciv/types/usage-types'
import {HarnessSessionId, SessionId, type NativeSessionRef} from '@conciv/types/chat-types'

type SessionHandlers = NonNullable<FakeEngineHandlers['sessions']>
type Cursor = {readonly updatedAt: number; readonly id: string} | null | undefined

export type PastSession = {
  readonly nativeId: string
  readonly title: string
  readonly updatedAt: number
  readonly cwd?: string
  readonly messages: readonly ChatMessage[]
}

export function textMessage(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return {id, role, parts: [{type: 'text', content}]}
}

export function sessionRow(
  id: string,
  title: string,
  updatedAt: number,
  native: NativeSessionRef | null = null,
): SessionMeta {
  return {
    id: SessionId.parse(id),
    title,
    updatedAt,
    running: false,
    origin: native === null ? 'conciv' : 'external',
    usage: null,
    model: null,
    effort: null,
    hidden: false,
    native,
    harnessKind: 'fake',
    lastRunAt: null,
  }
}

function page<Row extends SessionMeta>(rows: readonly Row[], cursor: Cursor, limit: number) {
  const start = cursor === null || cursor === undefined ? 0 : rows.findIndex((row) => row.id === cursor.id) + 1
  const sessions = rows.slice(start, start + limit)
  const last = sessions.at(-1)
  const more = start + limit < rows.length
  return {sessions, next: more && last !== undefined ? {updatedAt: last.updatedAt, id: last.id} : null}
}

export function pagedList(rows: readonly SessionMeta[]): NonNullable<SessionHandlers['list']> {
  return ({cursor, limit}) => page(rows, cursor, limit)
}

export function pagedPreview(messages: readonly ChatMessage[]): NonNullable<SessionHandlers['preview']> {
  return ({before, limit}) => {
    const end = before === null ? messages.length : messages.findIndex((message) => message.id === before)
    const start = Math.max(0, end - limit)
    return {messages: messages.slice(start, end), earlier: start === 0 ? null : (messages[start]?.id ?? null)}
  }
}

function messageText(message: ChatMessage): string {
  return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
}

function nativeRef(past: PastSession, directory: string): NativeSessionRef {
  return {harnessKind: 'fake', cwd: past.cwd ?? directory, nativeId: HarnessSessionId.parse(past.nativeId)}
}

function pastRow(past: PastSession, directory: string): SessionMeta {
  return sessionRow(`ses_${past.nativeId}`, past.title, past.updatedAt, nativeRef(past, directory))
}

function pastHit(past: PastSession, directory: string, term: string): SessionHit | null {
  const needle = term.toLowerCase()
  const excerpt = past.messages.map(messageText).find((text) => text.toLowerCase().includes(needle)) ?? null
  if (excerpt === null && !past.title.toLowerCase().includes(needle)) return null
  const elsewhere = past.cwd !== undefined && past.cwd !== directory
  return {
    ...pastRow(past, directory),
    excerpt,
    matched: [term],
    cwd: elsewhere ? (past.cwd ?? null) : null,
    resume: elsewhere ? `cd ${past.cwd} && claude --resume ${past.nativeId}` : null,
    preview: elsewhere ? nativeRef(past, directory) : null,
  }
}

export function pastSessionHandlers(
  conciv: readonly SessionMeta[],
  past: readonly PastSession[],
  directory = '/workspace',
): SessionHandlers {
  const here = past.filter((session) => session.cwd === undefined || session.cwd === directory)
  const rows = [...conciv, ...here.map((session) => pastRow(session, directory))].toSorted(
    (left, right) => right.updatedAt - left.updatedAt,
  )
  return {
    list: pagedList(rows),
    search: ({term, cursor, limit, everywhere}) => {
      const needle = term.toLowerCase()
      const concivHits = conciv
        .filter((session) => session.title.toLowerCase().includes(needle))
        .map((session) => ({...session, excerpt: null, matched: [term], cwd: null, resume: null, preview: null}))
      const pastHits = (everywhere ? past : here).flatMap((session) => {
        const hit = pastHit(session, directory, term)
        return hit === null ? [] : [hit]
      })
      return page(
        [...concivHits, ...pastHits].toSorted((left, right) => right.updatedAt - left.updatedAt),
        cursor,
        limit,
      )
    },
    preview: (input) => {
      if (!('nativeId' in input)) return {messages: [], earlier: null}
      return {
        messages: [...(past.find((session) => session.nativeId === input.nativeId)?.messages ?? [])],
        earlier: null,
      }
    },
  }
}

export function twoHarnesses(): NonNullable<FakeEngineHandlers['meta']> {
  return {
    harnesses: () => ({
      harnesses: ['alpha', 'beta'].map((name) => ({
        id: name === 'alpha' ? 'fake' : name,
        name,
        imageInput: false,
        persistentPty: false,
        models: [{id: 'fake-model', name: 'Fake model'}],
        defaultModel: 'fake-model',
        modelsFailed: false,
        login: {loggedIn: true},
      })),
      defaultHarness: 'fake',
    }),
  }
}

function engineClient(engine: FakeEngine): RpcClient {
  return createORPCClient<RpcClient>(engine.connect().link)
}

export async function addSession(engine: FakeEngine, title: string): Promise<SessionId> {
  const client = engineClient(engine)
  const {sessionId} = await client.sessions.create()
  await client.sessions.rename({sessionId, title})
  return sessionId
}

export async function titleSentSession(engine: FakeEngine, title: string): Promise<void> {
  const sent = engine.sent().at(-1)
  if (sent === undefined) throw new Error('nothing was sent to title')
  await engineClient(engine).sessions.rename({sessionId: SessionId.parse(sent.sessionId), title})
}

const QUICK_HEIGHT_KEY = 'conciv-qt-height'

export function forgetQuickHeight(seeded?: string): void {
  onTestFinished(() => localStorage.removeItem(QUICK_HEIGHT_KEY))
  if (seeded !== undefined) localStorage.setItem(QUICK_HEIGHT_KEY, seeded)
}

export function reportsUsage(usage: UsageSnapshot): FakeEngine {
  const engine: FakeEngine = createFakeEngine({
    handlers: {
      sessions: {
        get: async ({sessionId}) => {
          const {sessions} = await engineClient(engine).sessions.list({})
          const found = sessions.find((session) => session.id === sessionId)
          if (found === undefined) throw new ORPCError('NOT_FOUND', {message: 'session not found'})
          return engine.sent().length === 0 ? found : {...found, usage}
        },
      },
    },
  })
  return engine
}
