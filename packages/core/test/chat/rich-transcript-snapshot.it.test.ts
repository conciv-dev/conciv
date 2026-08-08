import {describe, it, expect, afterEach} from 'vitest'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {EventType} from '@tanstack/ai'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude, requireTranscriptPath} from '../helpers/adapters.js'
import {asSnapshot, firstSnapshot, userTexts} from '../helpers/snapshots.js'

const claude = requireClaude()

function transcriptLine(role: 'user' | 'assistant', text: string, id?: string): string {
  return JSON.stringify({type: role, message: {...(id ? {id} : {}), content: [{type: 'text', text}]}})
}

describe('rich-transcript snapshots (IT, claude capabilities over a flushed CLI transcript)', () => {
  const state = {kit: undefined as Kit | undefined}
  const dirs: string[] = []

  function tmp(): string {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-rich-snapshot-'))
    dirs.push(dir)
    return dir
  }

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  async function boot(claudeHome: string): Promise<Kit> {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({})}, claudeHome})).setup()
    state.kit = kit
    return kit
  }

  it('T5: a between-runs subscriber does not poison the next run-start snapshot', {timeout: 60_000}, async () => {
    const claudeHome = tmp()
    const kit = await boot(claudeHome)
    const sessionId = await kit.session()
    const keeper = await kit.attach(sessionId)

    await kit.rpc.chat.send({runId: 'rich-snapshot-1', sessionId, text: 'first turn before the resubscribe'})
    const firstTurn = await keeper.done({hangGuardMs: 20_000})

    const transcript = requireTranscriptPath(claude)(kit.stateRoot, 'sess-fake', claudeHome)
    mkdirSync(dirname(transcript), {recursive: true})
    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'first turn before the resubscribe'),
        transcriptLine('assistant', 'hello from fake', 'a1'),
      ].join('\n'),
    )

    const poisoner = await kit.attach(sessionId)
    const poisonerSnapshot = asSnapshot(
      await poisoner.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
    )
    expect(userTexts(poisonerSnapshot)).toEqual(['first turn before the resubscribe'])

    await kit.rpc.chat.send({runId: 'rich-snapshot-2', sessionId, text: 'second turn after the resubscribe'})
    const secondTurn = await keeper.done({hangGuardMs: 20_000})

    const runStart = firstSnapshot(secondTurn.all.slice(firstTurn.all.length))
    expect(userTexts(runStart)).toContain('second turn after the resubscribe')
    expect(runStart.messages.length).toBeGreaterThanOrEqual(poisonerSnapshot.messages.length)
  })

  it('T6: two identical prompts both survive the transcript merge', {timeout: 60_000}, async () => {
    const claudeHome = tmp()
    const kit = await boot(claudeHome)
    const sessionId = await kit.session()
    const keeper = await kit.attach(sessionId)

    await kit.rpc.chat.send({runId: 'rich-identical-1', sessionId, text: 'say it again'})
    await keeper.done({hangGuardMs: 20_000})

    const transcript = requireTranscriptPath(claude)(kit.stateRoot, 'sess-fake', claudeHome)
    mkdirSync(dirname(transcript), {recursive: true})
    writeFileSync(
      transcript,
      [transcriptLine('user', 'say it again'), transcriptLine('assistant', 'hello from fake', 'a1')].join('\n'),
    )

    await kit.rpc.chat.send({runId: 'rich-identical-2', sessionId, text: 'say it again'})
    await keeper.done({hangGuardMs: 20_000})

    writeFileSync(
      transcript,
      [
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a1'),
        transcriptLine('user', 'say it again'),
        transcriptLine('assistant', 'hello from fake', 'a2'),
      ].join('\n'),
    )

    const fresh = await kit.attach(sessionId)
    const snapshot = asSnapshot(
      await fresh.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
    )
    expect(userTexts(snapshot)).toEqual(['say it again', 'say it again'])
  })
})
