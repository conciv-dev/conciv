import {describe, it, expect} from 'vitest'
import {type ChatEvent, ChatEventType} from '@conciv/ai'
import {CHAT_SSE_PATH, CHAT_WS_PATH} from '@conciv/protocol/chat-types'
import {hydratedSnapshot, SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'
import {assistantTexts, userTexts} from '../helpers/snapshots.js'
import type {Kit} from '@conciv/harness-testkit'
import {foldChatEvents, serverSentEventsJoin, serverSentEventsTurn, socketTurn} from '@conciv/ai/server-testkit'

function foldedTranscript(chunks: ChatEvent[]): Array<{role: string; text: string}> {
  return foldChatEvents(chunks).map((message) => ({
    role: message.role,
    text: message.parts
      .flatMap((part) => (part.type === 'text' ? [part.content] : []))
      .join('')
      .trim(),
  }))
}

async function collect(stream: AsyncIterable<ChatEvent>, until: (chunk: ChatEvent) => boolean): Promise<ChatEvent[]> {
  const seen: ChatEvent[] = []
  for await (const chunk of stream) {
    seen.push(chunk)
    if (until(chunk)) break
  }
  return seen
}

const isTerminal = (chunk: ChatEvent): boolean =>
  chunk.type === ChatEventType.RUN_FINISHED || chunk.type === ChatEventType.RUN_ERROR

async function overWebSocket(kit: Kit, sessionId: string, runId: string, text: string): Promise<ChatEvent[]> {
  const abort = new AbortController()
  const stream = await socketTurn(`${kit.wsBase}${CHAT_WS_PATH}`, {
    threadId: sessionId,
    runId,
    messages: [{id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: text}]}],
    signal: abort.signal,
  })
  const chunks = await collect(stream, isTerminal)
  abort.abort()
  return chunks
}

describe('the chat delivery endpoints carry the same run whichever one drives it (IT)', () => {
  const sessions = useFakeSessions()

  it('a turn over a raw websocket folds to the transcript the testkit turn folds to', {timeout: 60_000}, async () => {
    const {kit, sessionId} = await sessions.open()

    const turn = await kit.turn('over rpc', {session: sessionId, runId: 'equivalence-rpc'})
    const overRpc = await turn.done({hangGuardMs: 20_000})

    const other = await kit.rpc.sessions.create()
    const chunks = await overWebSocket(kit, other.sessionId, 'equivalence-ws', 'over rpc')

    expect(foldedTranscript(chunks)).toEqual(foldedTranscript(overRpc.all))
    expect(foldedTranscript(chunks).map((message) => message.text)).toEqual([SCRIPTED_REPLY])
    const thread = await hydratedSnapshot(kit, other.sessionId)
    expect(userTexts(thread)).toEqual(['over rpc'])
    expect(assistantTexts(thread)).toEqual([SCRIPTED_REPLY])
  })

  it('a turn over the sse endpoint folds to the same transcript', {timeout: 60_000}, async () => {
    const {kit} = await sessions.open()
    const {sessionId} = await kit.rpc.sessions.create()

    const abort = new AbortController()
    const stream = serverSentEventsTurn(`${kit.base}${CHAT_SSE_PATH}`, {
      threadId: sessionId,
      runId: 'equivalence-sse',
      messages: [{id: 'sse-user', role: 'user', parts: [{type: 'text', content: 'over sse'}]}],
      signal: abort.signal,
    })
    const chunks = await collect(stream, isTerminal)

    expect(foldedTranscript(chunks).map((message) => message.text)).toEqual([SCRIPTED_REPLY])
    const thread = await hydratedSnapshot(kit, sessionId)
    expect(userTexts(thread)).toEqual(['over sse'])
    expect(assistantTexts(thread)).toEqual([SCRIPTED_REPLY])
  })

  it('an abort frame on the socket cancels the run', {timeout: 60_000}, async () => {
    const {kit, harness} = await sessions.open()
    const {sessionId} = await kit.rpc.sessions.create()
    harness.script.hold()

    const abort = new AbortController()
    const stream = await socketTurn(`${kit.wsBase}${CHAT_WS_PATH}`, {
      threadId: sessionId,
      runId: 'ws-abort',
      messages: [{id: 'abort-user', role: 'user', parts: [{type: 'text', content: 'hang on'}]}],
      signal: abort.signal,
    })
    await collect(stream, (chunk) => chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT)

    abort.abort()
    harness.script.release()

    await expect.poll(async () => (await kit.rpc.chat.hydrate({sessionId})).activeRun, {timeout: 15_000}).toBeNull()
    await expect.poll(async () => (await kit.rpc.chat.hydrate({sessionId})).messages.length > 0).toBe(true)
  })

  it('joining a finished run replays its log once', {timeout: 60_000}, async () => {
    const {kit} = await sessions.open()
    const {sessionId} = await kit.rpc.sessions.create()

    const first = await overWebSocket(kit, sessionId, 'replay-run', 'say it once')
    expect(foldedTranscript(first).map((message) => message.text)).toEqual([SCRIPTED_REPLY])

    const replayed = await collect(serverSentEventsJoin(`${kit.base}${CHAT_SSE_PATH}`, 'replay-run'), isTerminal)

    expect(foldedTranscript(replayed).map((message) => message.text)).toEqual([SCRIPTED_REPLY])
    expect(userTexts(await hydratedSnapshot(kit, sessionId))).toEqual(['say it once'])
    expect(replayed.filter((chunk) => chunk.type === ChatEventType.RUN_STARTED)).toHaveLength(1)
  })
})
