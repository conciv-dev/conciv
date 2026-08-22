import {describe, it, expect, afterEach} from 'vitest'
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

function transcriptLine(role: 'user' | 'assistant', text: string, id?: string): string {
  return JSON.stringify({type: role, message: {...(id ? {id} : {}), content: [{type: 'text', text}]}})
}

describe('merging the CLI transcript with db-owned history (IT, claude capabilities)', () => {
  const state: {kit: Kit | undefined} = {kit: undefined}
  const dirs: string[] = []

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  function tmp(): string {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-merge-repeat-'))
    dirs.push(dir)
    return dir
  }

  it('T11-B: a repeated opening prompt does not duplicate the turns between it', {timeout: 90_000}, async () => {
    const claudeHome = tmp()
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({})}, claudeHome})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const keeper = await kit.attach(sessionId)
    const transcript = requireTranscriptPath(claude)(kit.stateRoot, HarnessSessionId.parse('sess-fake'), claudeHome)
    mkdirSync(dirname(transcript), {recursive: true})

    await kit.rpc.chat.send({
      runId: 'merge-repeat-1',
      sessionId,
      content: [
        {type: 'text', content: 'say it again'},
        {type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}},
      ],
    })
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [transcriptLine('user', 'say it again'), transcriptLine('assistant', 'hello from fake', 'a1')].join('\n'),
    )

    await kit.rpc.chat.send({runId: 'merge-repeat-2', sessionId, text: 'and something else'})
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a1'),
        transcriptLine('user', 'and something else'),
        transcriptLine('assistant', 'hello from fake', 'a2'),
      ].join('\n'),
    )

    await kit.rpc.chat.send({runId: 'merge-repeat-3', sessionId, text: 'say it again'})
    await keeper.done({hangGuardMs: 25_000})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a1'),
        transcriptLine('user', 'and something else'),
        transcriptLine('assistant', 'hello from fake', 'a2'),
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a3'),
      ].join('\n'),
    )

    const fresh = await kit.attach(sessionId)
    const snapshot = asSnapshot(
      await fresh.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
    )
    expect(userTexts(snapshot)).toEqual(['say it again', 'and something else', 'say it again'])
  })
})
