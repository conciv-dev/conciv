import {describe, it, expect} from 'vitest'
import {EventType, StreamProcessor, type StreamChunk} from '@tanstack/ai'
import {fetchServerSentEvents, webSocket} from '@tanstack/ai-client'
import {CHAT_SSE_PATH, CHAT_WS_PATH} from '../../src/chat/delivery.js'
import {SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'
import type {Kit} from '@conciv/harness-testkit'

function foldedTranscript(chunks: StreamChunk[]): Array<{role: string; text: string}> {
  const processor = new StreamProcessor({})
  for (const chunk of chunks) processor.processChunk(chunk)
  return processor.getMessages().map((message) => ({
    role: message.role,
    text: message.parts
      .flatMap((part) => (part.type === 'text' ? [part.content] : []))
      .join('')
      .trim(),
  }))
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
  until: (chunk: StreamChunk) => boolean,
): Promise<StreamChunk[]> {
  const seen: StreamChunk[] = []
  for await (const chunk of stream) {
    seen.push(chunk)
    if (until(chunk)) break
  }
  return seen
}

const isTerminal = (chunk: StreamChunk): boolean =>
  chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR

async function overWebSocket(kit: Kit, sessionId: string, runId: string, text: string): Promise<StreamChunk[]> {
  const connection = webSocket(`${kit.wsBase}${CHAT_WS_PATH}`)
  const abort = new AbortController()
  const stream = connection.subscribe(abort.signal)
  await connection.send(
    [{id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: text}]}],
    {},
    abort.signal,
    {threadId: sessionId, runId},
  )
  const chunks = await collect(stream, isTerminal)
  abort.abort()
  return chunks
}

describe('the chat delivery endpoints carry the same run the subscribe stream does (IT)', () => {
  const sessions = useFakeSessions()

  it('a turn over the websocket folds to the transcript the subscribe stream folds to', {timeout: 60_000}, async () => {
    const {kit, sessionId, keeper} = await sessions.open()

    await kit.rpc.chat.send({runId: 'equivalence-rpc', sessionId, text: 'over rpc'})
    const overRpc = await keeper.done({hangGuardMs: 20_000})

    const other = await kit.rpc.sessions.create()
    const chunks = await overWebSocket(kit, other.sessionId, 'equivalence-ws', 'over rpc')

    expect(foldedTranscript(chunks)).toEqual(foldedTranscript(overRpc.all))
    expect(foldedTranscript(chunks).map((message) => message.text)).toEqual(['over rpc', SCRIPTED_REPLY])
  })

  it('a turn over the sse endpoint folds to the same transcript', {timeout: 60_000}, async () => {
    const {kit} = await sessions.open()
    const {sessionId} = await kit.rpc.sessions.create()

    const connection = fetchServerSentEvents(`${kit.base}${CHAT_SSE_PATH}`)
    const abort = new AbortController()
    const stream = connection.connect(
      [{id: 'sse-user', role: 'user', parts: [{type: 'text', content: 'over sse'}]}],
      {},
      abort.signal,
      {threadId: sessionId, runId: 'equivalence-sse'},
    )
    const chunks = await collect(stream, isTerminal)

    expect(foldedTranscript(chunks).map((message) => message.text)).toEqual(['over sse', SCRIPTED_REPLY])
  })

  it('an abort frame on the socket cancels the run', {timeout: 60_000}, async () => {
    const {kit, harness} = await sessions.open()
    const {sessionId} = await kit.rpc.sessions.create()
    harness.script.hold()

    const connection = webSocket(`${kit.wsBase}${CHAT_WS_PATH}`)
    const abort = new AbortController()
    const stream = connection.subscribe(abort.signal)
    await connection.send(
      [{id: 'abort-user', role: 'user', parts: [{type: 'text', content: 'hang on'}]}],
      {},
      abort.signal,
      {threadId: sessionId, runId: 'ws-abort'},
    )
    await collect(stream, (chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)

    abort.abort()
    harness.script.release()

    await expect.poll(async () => (await kit.rpc.chat.hydrate({sessionId})).activeRun, {timeout: 15_000}).toBeNull()
    await expect.poll(async () => (await kit.rpc.chat.hydrate({sessionId})).messages.length > 0).toBe(true)
  })

  it('joining a finished run replays its log once', {timeout: 60_000}, async () => {
    const {kit} = await sessions.open()
    const {sessionId} = await kit.rpc.sessions.create()

    const first = await overWebSocket(kit, sessionId, 'replay-run', 'say it once')
    expect(foldedTranscript(first).map((message) => message.text)).toEqual(['say it once', SCRIPTED_REPLY])

    const rejoin = fetchServerSentEvents(`${kit.base}${CHAT_SSE_PATH}`)
    const replayed = await collect(rejoin.joinRun('replay-run'), isTerminal)

    expect(foldedTranscript(replayed).map((message) => message.text)).toEqual(['say it once', SCRIPTED_REPLY])
    expect(replayed.filter((chunk) => chunk.type === EventType.RUN_STARTED)).toHaveLength(1)
  })
})
