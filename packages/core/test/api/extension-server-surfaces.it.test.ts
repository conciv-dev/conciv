import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {expect, test, vi} from 'vitest'
import {claude} from '@conciv/harness/claude'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {createTestHarness, createTestkit} from '@conciv/harness-testkit'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {bootCoreApp} from '../helpers/boot.js'
import {requireTranscriptPath} from '../helpers/adapters.js'

test('extension server api exposes sessions + harness surfaces backed by the real store', async () => {
  const captured: {server?: ServerApi<Record<never, never>>} = {}
  const runEnd = {resolve: (_sessionId: SessionId) => {}}
  const runEnded = new Promise<SessionId>((resolve) => (runEnd.resolve = resolve))
  const probe = defineExtension({name: 'probe'}).server((server) => {
    captured.server = server
    return {context: {}, turnEnd: (sessionId) => runEnd.resolve(sessionId)}
  })
  const harness = createTestHarness(claude)
  const kit = await createTestkit(harness, bootCoreApp({extensions: [probe]})).setup()
  try {
    const server = captured.server
    if (!server) throw new Error('server api not captured')
    const sessionId = SessionId.parse(await kit.session())

    expect(await server.sessions.resumeToken(sessionId)).toBeNull()
    await server.sessions.recordToken(sessionId, HarnessSessionId.parse('tok-round-trip'))
    expect(await server.sessions.resumeToken(sessionId)).toBe('tok-round-trip')

    const fresh = SessionId.parse('conciv_surfaces_fresh')
    await server.sessions.recordToken(fresh, HarnessSessionId.parse('tok-fresh'))
    expect(await server.sessions.resumeToken(fresh)).toBe('tok-fresh')

    expect(await server.sessions.chatBusy(sessionId)).toBe(false)
    harness.script.hold()
    await kit.rpc.chat.send({runId: 'extension-server-surfaces-1', sessionId, text: 'busy probe'})
    expect(await server.sessions.chatBusy(sessionId)).toBe(true)
    harness.script.release()
    expect(await runEnded).toBe(sessionId)
    await vi.waitFor(async () => expect(await server.sessions.chatBusy(sessionId)).toBe(false), {
      timeout: 8000,
      interval: 25,
    })

    expect(server.basePath).toBe('')
    expect(server.harness.id).toBe('claude')
    expect(typeof server.harness.ttyCommand).toBe('function')
    const noSuchToken = HarnessSessionId.parse('no-such-token')
    expect(await server.harness.transcriptExists?.(noSuchToken)).toBe(false)

    expect(await server.harness.transcriptMessages?.(noSuchToken)).toEqual([])
    const token = HarnessSessionId.parse(`surfaces-${process.pid}-${Math.random().toString(36).slice(2)}`)
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
