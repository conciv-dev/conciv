import {describe, it, expect, afterEach} from 'vitest'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {createFakeHarness, createTestkit, type BootApp, type Kit} from '@conciv/harness-testkit'
import {openDb, type ConcivDb} from '@conciv/db'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'
import {partTypes, userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot, SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'
import {recoverInterruptedRuns} from '../../src/chat/transcript-import.js'
import {writeRunMessages} from '../../src/chat/thread.js'
import {threadPendingFrom, threadUserTexts} from '../helpers/thread.js'
import {createRow} from '../../src/chat/session-rows.js'
import {HarnessSessionId} from '@conciv/protocol/chat-types'

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('the database owns the transcript for transcript-less harnesses (IT)', () => {
  const sessions = useFakeSessions()
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  function bootOn(root: string): BootApp {
    const inner = bootCoreApp({cwd: root})
    return (env) => inner({...env, stateRoot: root})
  }

  it('T3: finished turns and an interrupted turn both survive a restart', {timeout: 90_000}, async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-durable-'))
    roots.push(root)
    const harness = createFakeHarness({text: SCRIPTED_REPLY})
    const before = await createTestkit(harness, bootOn(root)).setup()
    const sessionId = await before.session('conciv_durable')
    const keeper = await before.attach(sessionId)
    await before.rpc.chat.send({runId: 'durable-1', sessionId, text: 'turn one before restart'})
    await keeper.done({hangGuardMs: 15_000})
    await before.rpc.chat.send({runId: 'durable-2', sessionId, text: 'turn two before restart'})
    await keeper.done({hangGuardMs: 15_000})

    harness.script.hold()
    await before.rpc.chat.send({runId: 'durable-3', sessionId, text: 'turn three interrupted'})
    await keeper.waitForRunStart()
    await before.cleanup()

    const after: Kit = await createTestkit(createFakeHarness({text: SCRIPTED_REPLY}), bootOn(root)).setup()
    sessions.adopt(after)
    const snapshot = await freshSubscriberSnapshot(after, sessionId)
    expect(userTexts(snapshot)).toEqual([
      'turn one before restart',
      'turn two before restart',
      'turn three interrupted',
    ])
  })

  it('T4: an attachment turn and later text turns each appear exactly once', {timeout: 60_000}, async () => {
    const {kit, sessionId, keeper} = await sessions.open()

    await kit.rpc.chat.send({
      runId: 'rich-1',
      sessionId,
      content: [
        {type: 'text', content: 'look at this'},
        {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_PIXEL}},
      ],
    })
    await keeper.done({hangGuardMs: 15_000})
    await kit.rpc.chat.send({runId: 'rich-2', sessionId, text: 'then one'})
    await keeper.done({hangGuardMs: 15_000})
    await kit.rpc.chat.send({runId: 'rich-3', sessionId, text: 'then two'})
    await keeper.done({hangGuardMs: 15_000})

    const snapshot = await freshSubscriberSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['look at this', 'then one', 'then two'])
    expect(partTypes(snapshot).filter((type) => type === 'image')).toHaveLength(1)
  })

  async function seedInterrupted(root: string, seed: {harnessKind: string; nativeId: string | null; text: string}) {
    const db = openDb(root)
    const sessionId = 'conciv_seeded'
    await createRow(db, {
      id: sessionId,
      harnessSessionId: seed.nativeId,
      harnessKind: seed.harnessKind,
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: root,
      deletedAt: null,
    })
    writeRunMessages(db, sessionId, 0, [{id: 'u1', role: 'user', parts: [{type: 'text', content: seed.text}]}])
    return {db, sessionId}
  }

  function writeClaudeTranscript(root: string, nativeId: string, text: string): void {
    const history = requireClaude().history
    if (!history?.transcriptPath) throw new Error('the claude harness lost its transcript path')
    const path = history.transcriptPath(root, HarnessSessionId.parse(nativeId), root)
    mkdirSync(dirname(path), {recursive: true})
    writeFileSync(path, `${JSON.stringify({type: 'user', message: {role: 'user', content: [{type: 'text', text}]}})}\n`)
  }

  function freshRoot(name: string): string {
    const root = mkdtempSync(join(tmpdir(), name))
    roots.push(root)
    return root
  }

  function expectSettledTurn(db: ConcivDb, sessionId: string, text: string): void {
    expect(threadPendingFrom(db, sessionId)).toBeNull()
    expect(threadUserTexts(db, sessionId)).toEqual([text])
  }

  it('T12: an interrupted turn the CLI never ingested survives recovery on an established session', async () => {
    const root = freshRoot('conciv-durable-established-')
    const text = 'turn written to the database before the cli was invoked'
    const {db, sessionId} = await seedInterrupted(root, {harnessKind: 'claude', nativeId: 'native-earlier', text})

    await recoverInterruptedRuns({db, harness: requireClaude(), claudeHome: root})

    expectSettledTurn(db, sessionId, text)
  })

  it('T12b: a turn the CLI already recorded appears in the thread exactly once', async () => {
    const root = freshRoot('conciv-durable-ingested-')
    const text = 'turn the cli already wrote to its transcript'
    const {db, sessionId} = await seedInterrupted(root, {harnessKind: 'claude', nativeId: 'native-ingested', text})
    writeClaudeTranscript(root, 'native-ingested', text)

    await recoverInterruptedRuns({db, harness: requireClaude(), claudeHome: root})

    expectSettledTurn(db, sessionId, text)
  })

  it('T13: recovery judges each session by its own recorded harness, not the booted one', async () => {
    const root = freshRoot('conciv-durable-switched-')
    const text = 'gemini turn interrupted before the app restarted on claude'
    const {db, sessionId} = await seedInterrupted(root, {harnessKind: 'gemini-cli', nativeId: 'native-gemini', text})
    writeClaudeTranscript(root, 'native-gemini', text)

    await recoverInterruptedRuns({db, harness: requireClaude(), claudeHome: root})

    expectSettledTurn(db, sessionId, text)
  })

  it('T7: an interrupted turn that never reached the CLI survives recovery on a transcriptHistory harness', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-durable-no-native-'))
    roots.push(root)
    const db = openDb(root)
    const sessionId = 'conciv_no_native'
    await createRow(db, {
      id: sessionId,
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: root,
      deletedAt: null,
    })
    writeRunMessages(db, sessionId, 0, [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'turn interrupted before a native id landed'}]},
    ])

    await recoverInterruptedRuns({db, harness: requireClaude(), claudeHome: root})

    expectSettledTurn(db, sessionId, 'turn interrupted before a native id landed')
  })
})
