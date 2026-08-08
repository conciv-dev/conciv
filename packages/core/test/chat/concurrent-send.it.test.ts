import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {createFakeHarness, until} from '@conciv/harness-testkit'
import {defineAttachment, defineExtension} from '@conciv/extension'
import {bootKit} from '../helpers/boot.js'
import {userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot, SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

const GATE_MIME = 'application/x-conciv-send-race'

type Gate = {reached: number; open: Promise<void>; release: () => void}

function makeGate(): Gate {
  const gate: Gate = {reached: 0, open: Promise.resolve(), release: () => {}}
  gate.open = new Promise<void>((resolve) => {
    gate.release = resolve
  })
  return gate
}

function gateExtension(gate: Gate) {
  const attachment = defineAttachment({mime: GATE_MIME})
  attachment.server(async () => {
    gate.reached += 1
    await gate.open
    return []
  })
  return defineExtension({name: 'send-race', attachments: [attachment]}).server(() => ({context: {}}))
}

function gatedTurn(text: string) {
  return [
    {type: 'text' as const, content: text},
    {type: 'document' as const, source: {type: 'data' as const, mimeType: GATE_MIME, value: 'e30='}},
  ]
}

async function collectChunks(source: AsyncIterable<StreamChunk>, into: StreamChunk[]): Promise<void> {
  try {
    for await (const chunk of source) into.push(chunk)
  } catch {}
}

function runsStarted(chunks: StreamChunk[]): number {
  return chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED).length
}

function runsFinished(chunks: StreamChunk[]): number {
  return chunks.filter((chunk) => chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls').length
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
    const gate = makeGate()
    const harness = createFakeHarness({text: SCRIPTED_REPLY})
    const kit = await bootKit({extensions: [gateExtension(gate)], firstChunkTimeoutMs: 500}, harness)
    sessions.adopt(kit)
    const sessionId = await kit.session()
    const seen: StreamChunk[] = []
    const watching = new AbortController()
    const stream = await kit.rpc.chat.subscribe({sessionId}, {signal: watching.signal})
    void collectChunks(stream, seen)

    harness.script.hold()
    const first = kit.rpc.chat.send({runId: 'sametick-1', sessionId, content: gatedTurn('same tick first')})
    const second = kit.rpc.chat.send({runId: 'sametick-2', sessionId, content: gatedTurn('same tick second')})
    await until(() => gate.reached === 2, {hangGuardMs: 10_000})
    gate.release()

    await until(() => runsStarted(seen) >= 1, {hangGuardMs: 15_000, settleFor: 300})
    expect(runsStarted(seen)).toBe(1)

    harness.script.release()
    await Promise.all([first, second])
    await until(() => runsFinished(seen) === 2, {hangGuardMs: 15_000})
    watching.abort()

    const snapshot = await freshSubscriberSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['same tick first', 'same tick second'])
  })
})
