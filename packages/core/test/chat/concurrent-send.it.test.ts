import {describe, it, expect} from 'vitest'
import type {StreamChunk} from '@tanstack/ai'
import {createFakeHarness, until} from '@conciv/harness-testkit'
import {defineAttachment, defineExtension} from '@conciv/extension'
import type {ChatContentPart} from '@conciv/protocol/chat-types'
import {bootKit} from '../helpers/boot.js'
import {userTexts} from '../helpers/snapshots.js'
import {collectChunks, peakLiveRuns, runsFinished} from '../helpers/run-tally.js'
import {hydratedSnapshot, SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

const SLOW_MIME = 'application/x-conciv-send-slow-expand'
const FAST_MIME = 'application/x-conciv-send-fast-expand'
const SLOW_EXPANSION_MS = 250

function pacedExtension(onSlowExpansion: () => void) {
  const slow = defineAttachment({mime: SLOW_MIME})
  slow.server(async () => {
    onSlowExpansion()
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

describe('one live run per session (IT)', () => {
  const sessions = useFakeSessions()

  it('T9: a second send without an intervening stop serializes behind the first', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId} = await sessions.open()

    harness.script.hold()
    const first = await kit.turn('first concurrent send', {session: sessionId, runId: 'concurrent-1'})
    await first.waitForRunStart()

    const queued = kit.turn('second concurrent send', {session: sessionId, runId: 'concurrent-2'})
    harness.script.release()
    const second = await queued

    await first.done({hangGuardMs: 15_000})
    await second.done({hangGuardMs: 15_000})

    const snapshot = await hydratedSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['first concurrent send', 'second concurrent send'])
  })

  it('T9: a send landing mid-expansion never overlaps as two live runs', {timeout: 60_000}, async () => {
    const harness = createFakeHarness({text: SCRIPTED_REPLY})
    const expansion = Promise.withResolvers<void>()
    const paced = pacedExtension(() => expansion.resolve())
    const kit = await bootKit({extensions: [paced], firstChunkTimeoutMs: 500}, harness)
    sessions.adopt(kit)
    const sessionId = await kit.session()
    const seen: StreamChunk[] = []
    const watching = new AbortController()
    const stream = await kit.rpc.chat.events({sessionId}, {signal: watching.signal})
    void collectChunks(stream, seen)

    const first = kit.turn(
      {content: pacedTurn('same tick first', SLOW_MIME)},
      {session: sessionId, runId: 'sametick-1'},
    )
    await expansion.promise
    const second = kit.turn(
      {content: pacedTurn('same tick second', FAST_MIME)},
      {session: sessionId, runId: 'sametick-2'},
    )
    await Promise.all([first, second])
    await until(() => runsFinished(seen) === 2, {hangGuardMs: 15_000})
    watching.abort()

    expect(peakLiveRuns(seen)).toBe(1)

    const snapshot = await hydratedSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['same tick first', 'same tick second'])
  })
})
