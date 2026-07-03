import {expect, test} from 'vitest'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {acquireLock, releaseLock} from '../../src/store/lock.js'
import {startTestServer} from '../helpers/server.js'

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
  } finally {
    await it.close()
  }
}, 30_000)
