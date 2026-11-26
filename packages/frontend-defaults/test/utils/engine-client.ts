import {createORPCClient} from '@orpc/client'
import {z} from 'zod'
import type {EngineClient} from '@conciv/client'
import type {FakeEngine} from '@internal/test-utils'
import type {SessionMeta} from '@conciv/protocol'
import {SessionId} from '@conciv/types/chat-types'
import {PANE_SESSION} from './sample-data.js'

const AnsweredSchema = z.object({answered: z.literal(true), value: z.json()})

function engineClient(engine: FakeEngine): EngineClient {
  return createORPCClient<EngineClient>(engine.connect().link)
}

export async function sendFromElsewhere(engine: FakeEngine, text: string): Promise<void> {
  const messages = [{id: `msg_${crypto.randomUUID()}`, role: 'user', content: text}]
  const runId = `run_${crypto.randomUUID()}`
  const stream = await engineClient(engine).chat.send({sessionId: PANE_SESSION, runId, messages})
  const events: unknown[] = []
  for await (const event of stream) events.push(event)
}

export async function approveFromElsewhere(engine: FakeEngine): Promise<void> {
  const client = engineClient(engine)
  const {pendingApprovals} = await client.chat.hydrate({sessionId: PANE_SESSION})
  const approvalId = pendingApprovals[0]?.approvalId
  if (approvalId === undefined) throw new Error('no ask is waiting to be approved')
  await client.chat.permissionDecision({approvalId, reply: 'once'})
}

export async function uiAnswers(engine: FakeEngine): Promise<unknown[]> {
  const {messages} = await engineClient(engine).chat.hydrate({sessionId: PANE_SESSION})
  const parts = messages.flatMap((message) => message.parts)
  const asked = parts.flatMap((part) => (part.type === 'tool-call' && part.name === 'conciv_ui' ? [part.id] : []))
  return parts.flatMap((part) =>
    part.type === 'tool-result' && asked.includes(part.toolCallId) && typeof part.content === 'string'
      ? [AnsweredSchema.parse(JSON.parse(part.content)).value]
      : [],
  )
}

export async function addSession(engine: FakeEngine, title: string): Promise<SessionId> {
  const client = engineClient(engine)
  const {sessionId} = await client.sessions.create()
  await client.sessions.rename({sessionId, title})
  return sessionId
}

export async function browserTabsOnceCounted(engine: FakeEngine, sessionId: SessionId, count: number) {
  const client = engineClient(engine)
  const watching = new AbortController()
  try {
    const changes = await client.tabs.changes(undefined, {signal: watching.signal})
    for (let step = await changes.next(); step.done !== true; step = await changes.next()) {
      const listed = await client.tabs.list({sessionId})
      if (listed.tabs.length === count) return listed
    }
  } finally {
    watching.abort()
  }
  throw new Error('the engine stopped reporting browser tab changes')
}

export async function titleSentSession(engine: FakeEngine, title: string): Promise<void> {
  const sent = engine.sent().at(-1)
  if (sent === undefined) throw new Error('nothing was sent to title')
  await engineClient(engine).sessions.rename({sessionId: SessionId.parse(sent.sessionId), title})
}

export function readSession(engine: FakeEngine, sessionId: string): Promise<SessionMeta> {
  return engineClient(engine).sessions.get({sessionId})
}

export function sentTexts(engine: FakeEngine): string[] {
  return engine
    .sent()
    .map((send) =>
      (send.messages.at(-1)?.parts ?? []).flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(''),
    )
}

export function sentJson(engine: FakeEngine): string[] {
  return engine.sent().map((send) => JSON.stringify(send.messages.at(-1)))
}
