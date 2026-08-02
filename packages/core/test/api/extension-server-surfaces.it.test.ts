import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {expect, test} from 'vitest'
import {claude} from '@conciv/harness/claude'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {createTestHarness, createTestkit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {runTurn} from '../helpers/turns.js'
import {requireTranscriptPath} from '../helpers/adapters.js'

test('extension server api exposes sessions + harness surfaces backed by the real store', async () => {
  const captured: {server?: ServerApi<Record<never, never>>} = {}
  const probe = defineExtension({name: 'probe'}).server((server) => {
    captured.server = server
    return {context: {}}
  })
  const harness = createTestHarness(claude)
  const kit = await createTestkit(harness, bootCoreApp({extensions: [probe]})).setup()
  try {
    const server = captured.server
    if (!server) throw new Error('server api not captured')
    const sessionId = await kit.session()

    expect(await server.sessions.resumeToken(sessionId)).toBeNull()
    await server.sessions.recordToken(sessionId, 'tok-round-trip')
    expect(await server.sessions.resumeToken(sessionId)).toBe('tok-round-trip')

    const fresh = 'conciv_surfaces_fresh'
    await server.sessions.recordToken(fresh, 'tok-fresh')
    expect(await server.sessions.resumeToken(fresh)).toBe('tok-fresh')

    const runEnded = new Promise<string>((resolve) =>
      server.sessions.onLocalRun((id, phase) => {
        if (phase === 'end') resolve(id)
      }),
    )
    expect(server.sessions.chatBusy(sessionId)).toBe(false)
    harness.script.hold()
    await kit.rpc.chat.send({sessionId, text: 'busy probe'})
    expect(server.sessions.chatBusy(sessionId)).toBe(true)
    harness.script.release()
    expect(await runEnded).toBe(sessionId)
    expect(server.sessions.chatBusy(sessionId)).toBe(false)

    expect(server.harness.id).toBe('claude')
    expect(typeof server.harness.ttyCommand).toBe('function')
    expect(await server.harness.transcriptExists?.('no-such-token')).toBe(false)

    const absent = await server.harness.observeTranscript?.('no-such-token')
    if (!absent) throw new Error('no transcript handle for an unknown token')
    expect(await absent.revision()).toEqual({ok: false, reason: 'missing', detail: expect.any(String)})
    absent.close()
    const token = `surfaces-${process.pid}-${Math.random().toString(36).slice(2)}`
    const transcript = requireTranscriptPath(claude)(server.cwd, token)
    mkdirSync(dirname(transcript), {recursive: true})
    writeFileSync(
      transcript,
      [
        JSON.stringify({type: 'user', message: {role: 'user', content: 'what else can you do?'}}),
        JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'Lots.'}]}}),
      ].join('\n') + '\n',
    )
    try {
      const handle = await server.harness.observeTranscript?.(token)
      if (!handle) throw new Error('no transcript handle')
      const chunk = await handle.read()
      if (chunk.ok === false) throw new Error(`transcript unreadable: ${chunk.detail}`)
      expect(chunk.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
      handle.close()
    } finally {
      rmSync(transcript, {force: true})
    }
  } finally {
    await kit.cleanup()
  }
}, 30_000)

test('a chat turn brackets onLocalRun listeners with start and end', async () => {
  const captured: {server?: ServerApi<Record<never, never>>} = {}
  const probe = defineExtension({name: 'probe-turn'}).server((server) => {
    captured.server = server
    return {context: {}}
  })
  const kit = await createTestkit(claude, bootCoreApp({extensions: [probe], fakeClaude: {}})).setup()
  try {
    const server = captured.server
    if (!server) throw new Error('server api not captured')
    const turns: {sessionId: string; phase: 'start' | 'end'}[] = []
    const registration: {unregister?: () => void} = {}
    const bracketed = new Promise<void>((resolve) => {
      registration.unregister = server.sessions.onLocalRun((sessionId, phase) => {
        turns.push({sessionId, phase})
        if (phase === 'end') resolve()
      })
    })

    const sessionId = await kit.session()
    await runTurn(kit, 'hi', sessionId)
    await bracketed
    expect(turns).toEqual([
      {sessionId, phase: 'start'},
      {sessionId, phase: 'end'},
    ])

    registration.unregister?.()
    await runTurn(kit, 'again', sessionId)
    expect(turns).toHaveLength(2)
  } finally {
    await kit.cleanup()
  }
}, 30_000)
