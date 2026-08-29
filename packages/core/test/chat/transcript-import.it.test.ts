import {describe, expect, it, afterEach} from 'vitest'
import {appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {openDb} from '@conciv/db'
import {createTestkit, type BootApp, type Kit} from '@conciv/harness-testkit'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude, requireTranscriptPath} from '../helpers/adapters.js'
import {userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot} from '../helpers/fake-session.js'
import {freshSnapshot, useTranscriptFixture} from '../helpers/transcript-fixture.js'
import {createRow} from '../../src/chat/session-rows.js'

const TERMINAL_NATIVE_ID = 'sess-terminal'

function line(role: 'user' | 'assistant', text: string, uuid: string): string {
  return JSON.stringify({type: role, uuid, message: {id: uuid, content: [{type: 'text', text}]}})
}

function turn(prompt: string, reply: string, index: number): string[] {
  return [line('user', prompt, `rec-u-${index}`), line('assistant', reply, `rec-a-${index}`)]
}

describe('the CLI transcript is imported into the thread table (IT, claude capabilities)', () => {
  const roots: string[] = []
  const kits: Kit[] = []

  afterEach(async () => {
    for (const kit of kits.splice(0)) await kit.cleanup()
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  function freshRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'conciv-transcript-import-'))
    roots.push(root)
    return root
  }

  function transcriptPathIn(root: string): string {
    const path = requireTranscriptPath(requireClaude())(root, HarnessSessionId.parse(TERMINAL_NATIVE_ID), root)
    mkdirSync(dirname(path), {recursive: true})
    return path
  }

  function bootOn(root: string): BootApp {
    const inner = bootCoreApp({cwd: root, claudeHome: root})
    return (env) => inner({...env, stateRoot: root, cwd: root})
  }

  async function seedTerminalSession(root: string): Promise<string> {
    const db = openDb(root)
    const sessionId = 'conciv_terminal'
    await createRow(db, {
      id: sessionId,
      harnessSessionId: TERMINAL_NATIVE_ID,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: root,
      deletedAt: null,
    })
    return sessionId
  }

  async function openTerminalSession(root: string): Promise<{kit: Kit; sessionId: string}> {
    const sessionId = await seedTerminalSession(root)
    const kit = await createTestkit(requireClaude(), bootOn(root)).setup()
    kits.push(kit)
    return {kit, sessionId}
  }

  it('a session born in the terminal opens with every one of its turns', {timeout: 60_000}, async () => {
    const root = freshRoot()
    writeFileSync(
      transcriptPathIn(root),
      [...turn('terminal one', 'reply one', 1), ...turn('terminal two', 'reply two', 2)].join('\n'),
    )
    const {kit, sessionId} = await openTerminalSession(root)

    expect(userTexts(await freshSubscriberSnapshot(kit, sessionId))).toEqual(['terminal one', 'terminal two'])
  })

  it('an imported terminal session survives the transcript being deleted', {timeout: 60_000}, async () => {
    const root = freshRoot()
    const transcript = transcriptPathIn(root)
    writeFileSync(transcript, turn('terminal one', 'reply one', 1).join('\n'))
    const {kit, sessionId} = await openTerminalSession(root)
    expect(userTexts(await freshSubscriberSnapshot(kit, sessionId))).toEqual(['terminal one'])

    rmSync(transcript)

    expect(userTexts(await freshSubscriberSnapshot(kit, sessionId))).toEqual(['terminal one'])
  })

  it('a turn added in the terminal while the session is open shows up', {timeout: 60_000}, async () => {
    const root = freshRoot()
    const transcript = transcriptPathIn(root)
    writeFileSync(transcript, turn('terminal one', 'reply one', 1).join('\n'))
    const {kit, sessionId} = await openTerminalSession(root)
    expect(userTexts(await freshSubscriberSnapshot(kit, sessionId))).toEqual(['terminal one'])

    appendFileSync(transcript, `\n${turn('terminal two', 'reply two', 2).join('\n')}`)

    expect(userTexts(await freshSubscriberSnapshot(kit, sessionId))).toEqual(['terminal one', 'terminal two'])
  })

  describe('against a widget-driven session', () => {
    const fixture = useTranscriptFixture('conciv-import-widget')

    it('does not duplicate a widget turn when the CLI copy is imported', {timeout: 90_000}, async () => {
      const open = await fixture.open()
      const {kit, sessionId, keeper, transcript} = open

      await kit.turn('widget turn', {session: sessionId, runId: 'import-widget-1'})
      await keeper.done({hangGuardMs: 25_000})
      writeFileSync(transcript, turn('widget turn', 'hello from fake', 1).join('\n'))

      expect(userTexts(await freshSnapshot(open))).toEqual(['widget turn'])
      expect(userTexts(await freshSnapshot(open))).toEqual(['widget turn'])
    })

    it('keeps the thread and re-anchors when the transcript is compacted away', {timeout: 90_000}, async () => {
      const open = await fixture.open()
      const {kit, sessionId, keeper, transcript} = open

      await kit.turn('before compaction', {session: sessionId, runId: 'import-compact-1'})
      await keeper.done({hangGuardMs: 25_000})
      writeFileSync(transcript, turn('before compaction', 'hello from fake', 1).join('\n'))
      expect(userTexts(await freshSnapshot(open))).toEqual(['before compaction'])

      writeFileSync(transcript, turn('a compacted summary', 'hello from fake', 9).join('\n'))
      expect(userTexts(await freshSnapshot(open))).toEqual(['before compaction'])

      appendFileSync(transcript, `\n${turn('after compaction', 'hello from fake', 10).join('\n')}`)
      expect(userTexts(await freshSnapshot(open))).toEqual(['before compaction', 'after compaction'])
    })
  })
})
