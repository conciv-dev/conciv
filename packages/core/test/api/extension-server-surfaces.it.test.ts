import {spawn} from 'node:child_process'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'
import {claude} from '@conciv/harness/claude'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {acquireLock, releaseLock} from '../../src/store/lock.js'
import {startTestServer, type SpawnHarness} from '../helpers/server.js'

const fakeClaude = fileURLToPath(new URL('../fixtures/fake-claude.ts', import.meta.url))

const fakeSpawn: SpawnHarness = (args, cwd) => {
  const child = spawn(process.execPath, [fakeClaude, ...args], {cwd, stdio: ['pipe', 'pipe', 'pipe']})
  const {stdin, stdout, stderr} = child
  if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
  return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => void child.kill('SIGTERM')}
}

test('extension server api exposes sessions + harness surfaces backed by the real store', async () => {
  const captured: {server?: ServerApi<Record<never, never>>} = {}
  const probe = defineExtension({name: 'probe'}).server((server) => {
    captured.server = server
    return {context: {}}
  })
  const it = await startTestServer({extensions: [probe]})
  try {
    const server = captured.server
    if (!server) throw new Error('server api not captured')
    const sessionId = await it.resolve()

    expect(await server.sessions.resumeToken(sessionId)).toBeNull()
    await server.sessions.recordToken(sessionId, 'tok-round-trip')
    expect(await server.sessions.resumeToken(sessionId)).toBe('tok-round-trip')

    const fresh = 'conciv_surfaces_fresh'
    await server.sessions.recordToken(fresh, 'tok-fresh')
    expect(await server.sessions.resumeToken(fresh)).toBe('tok-fresh')

    expect(server.sessions.chatBusy(sessionId)).toBe(false)
    acquireLock(it.stateRoot, sessionId, 'chat', process.pid)
    expect(server.sessions.chatBusy(sessionId)).toBe(true)
    releaseLock(it.stateRoot, sessionId)
    expect(server.sessions.chatBusy(sessionId)).toBe(false)

    expect(server.harness.id).toBe('claude')
    expect(typeof server.harness.ttyCommand).toBe('function')
    expect(server.harness.transcriptExists?.('no-such-token')).toBe(false)

    expect(await server.harness.transcriptMessages?.('no-such-token')).toEqual([])
    const token = `surfaces-${process.pid}-${Math.random().toString(36).slice(2)}`
    const history = claude.history
    if (!history) throw new Error('claude adapter has no history surface')
    const transcript = history.transcriptPath(server.cwd, token)
    mkdirSync(dirname(transcript), {recursive: true})
    writeFileSync(
      transcript,
      [
        JSON.stringify({type: 'user', message: {role: 'user', content: 'what else can you do?'}}),
        JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'Lots.'}]}}),
      ].join('\n'),
    )
    try {
      const messages = await server.harness.transcriptMessages?.(token)
      expect(messages?.map((m) => m.role)).toEqual(['user', 'assistant'])
    } finally {
      rmSync(transcript, {force: true})
    }
  } finally {
    await it.close()
  }
}, 30_000)

test('a chat turn fires onChatTurn listeners with the session id', async () => {
  const captured: {server?: ServerApi<Record<never, never>>} = {}
  const probe = defineExtension({name: 'probe-turn'}).server((server) => {
    captured.server = server
    return {context: {}}
  })
  const it = await startTestServer({extensions: [probe], spawnHarness: fakeSpawn})
  try {
    const server = captured.server
    if (!server) throw new Error('server api not captured')
    const turns: string[] = []
    server.sessions.onChatTurn((sessionId) => turns.push(sessionId))

    const sessionId = await it.resolve()
    await it.postChat({id: 'm', role: 'user', parts: [{type: 'text', content: 'hi'}]}, sessionId)
    expect(turns).toEqual([sessionId])
  } finally {
    await it.close()
  }
}, 30_000)
