import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {createFakeHarness, until} from '@conciv/harness-testkit'
import {defineAttachment, defineExtension} from '@conciv/extension'
import type {ChatContentPart} from '@conciv/protocol/chat-types'
import {bootKit} from '../helpers/boot.js'
import {userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot, SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

const SLOW_MIME = 'application/x-conciv-send-slow-expand'
const FAST_MIME = 'application/x-conciv-send-fast-expand'
const SLOW_EXPANSION_MS = 250

function pacedExtension() {
  const slow = defineAttachment({mime: SLOW_MIME})
  slow.server(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, SLOW_EXPANSION_MS))
    return []
  })
  const fast = defineAttachment({mime: FAST_MIME})
  fast.server(async () => [])
  return defineExtension({name: 'send-pace', attachments: [slow, fast]}).server(() => ({context: {}}))
}

function pacedTurn(text: string, mimeType: string): ChatContentPart[] {
  return [
    {type: 'text', content: text},
    {type: 'document', source: {type: 'data', mimeType, value: 'e30='}},
  ]
}

async function collectChunks(source: AsyncIterable<StreamChunk>, into: StreamChunk[]): Promise<void> {
  try {
    for await (const chunk of source) into.push(chunk)
  } catch {}
}

type RunEndChunk = Extract<StreamChunk, {type: EventType.RUN_FINISHED}>

function isRunEnd(chunk: StreamChunk): chunk is RunEndChunk {
  return chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls'
}

function runsFinished(chunks: StreamChunk[]): number {
  return chunks.filter(isRunEnd).length
}

function peakLiveRuns(chunks: StreamChunk[]): number {
  const open = new Set<string>()
  const tally = {peak: 0}
  for (const chunk of chunks) {
    if (chunk.type === EventType.RUN_STARTED) open.add(chunk.runId)
    if (isRunEnd(chunk)) open.delete(chunk.runId)
    tally.peak = Math.max(tally.peak, open.size)
  }
  return tally.peak
}

describe('one live run per session (IT)', () => {
  const sessions = useFakeSessions()

  it('T9: a second send without an intervening stop serializes behind the first', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId, keeper} = await sessions.open()

    harness.script.hold()
    await kit.rpc.chat.send({runId: 'concurrent-1', sessionId, text: 'first concurrent send'})
    await keeper.waitFor((chunk) => chunk.type === EventType.RUN_STARTED, {hangGuardMs: 15_000})

    const second = kit.rpc.chat.send({runId: 'concurrent-2', sessionId, text: 'second concurrent send'})
    harness.script.release()
    await second

    await keeper.done({hangGuardMs: 15_000})
    await keeper.done({hangGuardMs: 15_000})

    const snapshot = await freshSubscriberSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['first concurrent send', 'second concurrent send'])
  })

  it('T9: two sends released into the same tick never overlap as two live runs', {timeout: 60_000}, async () => {
    const harness = createFakeHarness({text: SCRIPTED_REPLY})
    const kit = await bootKit({extensions: [pacedExtension()], firstChunkTimeoutMs: 500}, harness)
    sessions.adopt(kit)
    const sessionId = await kit.session()
    const seen: StreamChunk[] = []
    const watching = new AbortController()
    const stream = await kit.rpc.chat.subscribe({sessionId}, {signal: watching.signal})
    void collectChunks(stream, seen)

    const first = kit.rpc.chat.send({runId: 'sametick-1', sessionId, content: pacedTurn('same tick first', SLOW_MIME)})
    const second = kit.rpc.chat.send({
      runId: 'sametick-2',
      sessionId,
      content: pacedTurn('same tick second', FAST_MIME),
    })
    await Promise.all([first, second])
    await until(() => runsFinished(seen) === 2, {hangGuardMs: 15_000})
    watching.abort()

    expect(peakLiveRuns(seen)).toBe(1)

    const snapshot = await freshSubscriberSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['same tick first', 'same tick second'])
  })
})
