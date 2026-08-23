import {afterEach, describe, expect, it} from 'vitest'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {EventType} from '@tanstack/ai'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude, requireTranscriptPath} from '../helpers/adapters.js'
import {asSnapshot, userTexts} from '../helpers/snapshots.js'

const claude = requireClaude()

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function transcriptLine(role: 'user' | 'assistant', text: string, uuid: string, messageId?: string): string {
  return JSON.stringify({
    type: role,
    uuid,
    message: {...(messageId ? {id: messageId} : {}), content: [{type: 'text', text}]},
  })
}

describe('the transcript merge anchors on native record ids (IT, claude capabilities)', () => {
  const state: {kit: Kit | undefined} = {kit: undefined}
  const dirs: string[] = []

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  function tmp(): string {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-anchor-'))
    dirs.push(dir)
    return dir
  }

  it(
    'does not replay the CLI copy of a turn whose stored prompt carries no matching text',
    {timeout: 90_000},
    async () => {
      const claudeHome = tmp()
      const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({})}, claudeHome})).setup()
      state.kit = kit
      const sessionId = await kit.session()
      const keeper = await kit.attach(sessionId)
      const transcript = requireTranscriptPath(claude)(kit.stateRoot, HarnessSessionId.parse('sess-fake'), claudeHome)
      mkdirSync(dirname(transcript), {recursive: true})

      await kit.rpc.chat.send({
        runId: 'anchor-image-1',
        sessionId,
        content: [{type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}}],
      })
      await keeper.done({hangGuardMs: 25_000})

      writeFileSync(
        transcript,
        [
          transcriptLine('user', '[image #1 attached]', 'rec-user-1'),
          transcriptLine('assistant', 'hello from fake', 'rec-asst-1', 'a1'),
        ].join('\n'),
      )

      const fresh = await kit.attach(sessionId)
      const snapshot = asSnapshot(
        await fresh.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
      )
      expect(snapshot.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    },
  )

  it('keeps the settled CLI turns that precede the first folded run', {timeout: 90_000}, async () => {
    const claudeHome = tmp()
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({})}, claudeHome})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const keeper = await kit.attach(sessionId)
    const transcript = requireTranscriptPath(claude)(kit.stateRoot, HarnessSessionId.parse('sess-fake'), claudeHome)
    mkdirSync(dirname(transcript), {recursive: true})

    await kit.rpc.chat.send({runId: 'anchor-text-1', sessionId, text: 'first turn'})
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'first turn', 'rec-user-1'),
        transcriptLine('assistant', 'hello from fake', 'rec-asst-1', 'a1'),
      ].join('\n'),
    )

    await kit.rpc.chat.send({
      runId: 'anchor-image-2',
      sessionId,
      content: [{type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}}],
    })
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'first turn', 'rec-user-1'),
        transcriptLine('assistant', 'hello from fake', 'rec-asst-1', 'a1'),
        transcriptLine('user', '[image #1 attached]', 'rec-user-2'),
        transcriptLine('assistant', 'hello from fake', 'rec-asst-2', 'a2'),
      ].join('\n'),
    )

    const fresh = await kit.attach(sessionId)
    const snapshot = asSnapshot(
      await fresh.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
    )
    expect(userTexts(snapshot)).toEqual(['first turn', ''])
    expect(snapshot.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })
})
