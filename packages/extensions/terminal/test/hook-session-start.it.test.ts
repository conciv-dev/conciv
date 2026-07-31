import {describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {ServerHarness} from '@conciv/extension'
import {bashHarness, closeServersAfterEach, startTerminalServer, type TerminalTestServer} from './helpers.js'

const open = closeServersAfterEach()

const OWNER = 'conciv_hook_owner'
const RIVAL = 'conciv_hook_rival'
const OLD = '0c1d2e3f-aaaa-bbbb-cccc-000011112222'
const NEW = '0c1d2e3f-aaaa-bbbb-cccc-333344445555'
const TAKEN = '0c1d2e3f-aaaa-bbbb-cccc-666677778888'

function harnessWithTranscripts(written: Set<string>): ServerHarness {
  return {...bashHarness, transcriptExists: (token) => Promise.resolve(written.has(token))}
}

async function sessionStart(
  server: TerminalTestServer,
  body: {session_id: string; source?: string},
): Promise<{status: number; ok: boolean}> {
  const response = await fetch(`${server.base}/api/ext/terminal/hook`, {
    method: 'POST',
    headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: OWNER},
    body: JSON.stringify({...body, hook_event_name: 'SessionStart', cwd: '/workspace'}),
  })
  const payload: unknown = await response.json()
  const ok = typeof payload === 'object' && payload !== null && 'ok' in payload ? payload.ok : null
  return {status: response.status, ok: ok === true}
}

async function serverWithToken(written: Set<string>): Promise<TerminalTestServer> {
  const server = await startTerminalServer(harnessWithTranscripts(written))
  open.servers.push(server)
  await server.sessions.recordToken(OWNER, OLD)
  return server
}

describe('SessionStart only repoints the resume token on a genuine continuation', () => {
  it('keeps the current token when a fresh claude starts up over a live transcript', async () => {
    const server = await serverWithToken(new Set([OLD]))
    expect(await sessionStart(server, {session_id: NEW, source: 'startup'})).toEqual({status: 200, ok: true})
    expect(server.sessions.tokens.get(OWNER)).toBe(OLD)
  })

  it('keeps the current token when the hook reports no source at all', async () => {
    const server = await serverWithToken(new Set([OLD]))
    expect(await sessionStart(server, {session_id: NEW})).toEqual({status: 200, ok: true})
    expect(server.sessions.tokens.get(OWNER)).toBe(OLD)
  })

  it('keeps the current token for a source nobody recognises', async () => {
    const server = await serverWithToken(new Set([OLD]))
    expect(await sessionStart(server, {session_id: NEW, source: 'teleported'})).toEqual({status: 200, ok: true})
    expect(server.sessions.tokens.get(OWNER)).toBe(OLD)
  })

  it('repoints on resume', async () => {
    const server = await serverWithToken(new Set([OLD]))
    expect(await sessionStart(server, {session_id: NEW, source: 'resume'})).toEqual({status: 200, ok: true})
    expect(server.sessions.tokens.get(OWNER)).toBe(NEW)
  })

  it('repoints on compact', async () => {
    const server = await serverWithToken(new Set([OLD]))
    expect(await sessionStart(server, {session_id: NEW, source: 'compact'})).toEqual({status: 200, ok: true})
    expect(server.sessions.tokens.get(OWNER)).toBe(NEW)
  })

  it('repoints on startup once the old transcript is gone', async () => {
    const server = await serverWithToken(new Set())
    expect(await sessionStart(server, {session_id: NEW, source: 'startup'})).toEqual({status: 200, ok: true})
    expect(server.sessions.tokens.get(OWNER)).toBe(NEW)
  })

  it('answers 200 with ok:false when the token belongs to another session', async () => {
    const server = await serverWithToken(new Set([OLD]))
    await server.sessions.recordToken(RIVAL, TAKEN)
    expect(await sessionStart(server, {session_id: TAKEN, source: 'resume'})).toEqual({status: 200, ok: false})
    expect(server.sessions.tokens.get(OWNER)).toBe(OLD)
    expect(server.sessions.tokens.get(RIVAL)).toBe(TAKEN)
    expect(await sessionStart(server, {session_id: NEW, source: 'resume'})).toEqual({status: 200, ok: true})
    expect(server.sessions.tokens.get(OWNER)).toBe(NEW)
  })
})
