import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EventType} from '@tanstack/ai'
import {createFakeHarness, createTestkit, type BootApp, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {partTypes, userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot, SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

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
    await keeper.waitFor((chunk) => chunk.type === EventType.RUN_STARTED, {hangGuardMs: 15_000})
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
})
