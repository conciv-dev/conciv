import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {expect, test} from 'vitest'
import {claude} from '@conciv/harness/claude'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {createTestHarness, createTestkit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireTranscriptPath} from '../helpers/adapters.js'

test('extension server api exposes sessions + harness surfaces backed by the real store', async () => {
  const captured: {server?: ServerApi<Record<never, never>>} = {}
  const runEnd = {resolve: (_sessionId: string) => {}}
  const runEnded = new Promise<string>((resolve) => (runEnd.resolve = resolve))
  const probe = defineExtension({name: 'probe'}).server((server) => {
    captured.server = server
    return {context: {}, turnEnd: (sessionId: string) => runEnd.resolve(sessionId)}
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

    expect(server.sessions.chatBusy(sessionId)).toBe(false)
    harness.script.hold()
    await kit.rpc.chat.send({runId: 'extension-server-surfaces-1', sessionId, text: 'busy probe'})
    expect(server.sessions.chatBusy(sessionId)).toBe(true)
    harness.script.release()
    expect(await runEnded).toBe(sessionId)
    expect(server.sessions.chatBusy(sessionId)).toBe(false)

    expect(server.basePath).toBe('')
    expect(server.harness.id).toBe('claude')
    expect(typeof server.harness.ttyCommand).toBe('function')
    expect(await server.harness.transcriptExists?.('no-such-token')).toBe(false)

    expect(await server.harness.transcriptMessages?.('no-such-token')).toEqual([])
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
      const messages = await server.harness.transcriptMessages?.(token)
      if (!messages) throw new Error('no transcript messages')
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    } finally {
      rmSync(transcript, {force: true})
    }
  } finally {
    await kit.cleanup()
  }
}, 30_000)
