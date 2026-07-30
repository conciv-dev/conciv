import {randomUUID} from 'node:crypto'
import {afterEach, describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {TranscriptStat} from '@conciv/protocol/harness-types'
import {until} from '@conciv/harness-testkit'
import {bashHarness, startTerminalServer, type TerminalTestServer} from './helpers.js'
import type {HOOK_EVENT_NAMES} from '../src/shared/protocol.js'

type HookEvent = (typeof HOOK_EVENT_NAMES)[number]

type Snapshot = {state: string; source: string; lastSeenAt: number}

const open: {servers: TerminalTestServer[]} = {servers: []}

async function startServer(stat?: () => TranscriptStat | null): Promise<TerminalTestServer> {
  const server = await startTerminalServer(
    stat ? {...bashHarness, transcriptStat: () => Promise.resolve(stat())} : bashHarness,
  )
  open.servers.push(server)
  return server
}

function hook(
  server: TerminalTestServer,
  event: HookEvent,
  over: {sessionId?: string | null; harnessSessionId?: string; body?: unknown} = {},
): Promise<Response> {
  const headers: Record<string, string> = {'content-type': 'application/json'}
  const sessionId = over.sessionId
  if (sessionId) headers[CONCIV_SESSION_HEADER] = sessionId
  return fetch(`${server.base}/api/ext/terminal/hook`, {
    method: 'POST',
    headers,
    body: JSON.stringify(
      over.body ?? {session_id: over.harnessSessionId ?? randomUUID(), hook_event_name: event, cwd: '/workspace'},
    ),
  })
}

async function watchPresence(
  server: TerminalTestServer,
  sessionId: string,
): Promise<{seen: Snapshot[]; stop: () => Promise<void>}> {
  const controller = new AbortController()
  const stream = await server.rpc.presence({sessionId}, {signal: controller.signal})
  const seen: Snapshot[] = []
  const pump = (async () => {
    for await (const snapshot of stream) seen.push(snapshot)
  })()
  await until(() => seen.length >= 1)
  return {
    seen,
    stop: async () => {
      controller.abort()
      await pump.catch(() => {})
    },
  }
}

afterEach(async () => {
  const servers = open.servers.splice(0)
  await Promise.all(servers.map((server) => server.close()))
})

describe('terminal presence', () => {
  it('starts idle and follows the claude hook lifecycle', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const watch = await watchPresence(server, sessionId)
    expect(watch.seen[0]?.state).toBe('idle')

    expect((await hook(server, 'SessionStart', {sessionId})).status).toBe(200)
    await until(() => watch.seen.at(-1)?.state === 'connected')
    expect(watch.seen.at(-1)?.source).toBe('hook')

    await hook(server, 'UserPromptSubmit', {sessionId})
    await until(() => watch.seen.at(-1)?.state === 'working')

    await hook(server, 'Stop', {sessionId})
    await until(() => watch.seen.at(-1)?.state === 'connected')

    await hook(server, 'SessionEnd', {sessionId})
    await until(() => watch.seen.at(-1)?.state === 'idle')
    await watch.stop()
  })

  it('blocks a send while the terminal is working and confirms once it stops', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})

    await hook(server, 'UserPromptSubmit', {sessionId})
    expect(server.sessions.runSend(sessionId, false)).toMatchObject({allow: false, code: 'EXTERNAL_ACTIVE'})
    expect(server.sessions.runSend(sessionId, true)).toMatchObject({allow: false, code: 'EXTERNAL_ACTIVE'})

    await hook(server, 'Stop', {sessionId})
    expect(server.sessions.runSend(sessionId, false)).toMatchObject({allow: false, code: 'EXTERNAL_ACTIVE'})
    expect(server.sessions.runSend(sessionId, true)).toEqual({allow: true})

    await hook(server, 'SessionEnd', {sessionId})
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})
  })

  it('records a drifted harness session id reported by SessionStart', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    server.sessions.tokens.set(sessionId, 'stale-token')
    const harnessSessionId = randomUUID()
    await hook(server, 'SessionStart', {sessionId, harnessSessionId})
    expect(server.sessions.tokens.get(sessionId)).toBe(harnessSessionId)
  })

  it('rejects an invalid hook body and ignores a hook without our session header', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const bad = await hook(server, 'Stop', {sessionId, body: {hook_event_name: 'Nope'}})
    expect(bad.status).toBe(400)

    const headerless = await hook(server, 'UserPromptSubmit')
    expect(headerless.status).toBe(200)
    expect(await headerless.json()).toEqual({})
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})
  })

  it('keeps presence alive from an mcp request', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const watch = await watchPresence(server, sessionId)
    server.sessions.fireMcpRequest(sessionId)
    await until(() => watch.seen.at(-1)?.state === 'connected')
    expect(watch.seen.at(-1)?.source).toBe('signal')
    await watch.stop()
  })

  it('refreshes presence and notifies core when the transcript file grows', async () => {
    const file = {reads: 0, growing: false, size: 10}
    const server = await startServer(() => {
      file.reads += 1
      if (file.growing) file.size += 1
      return {mtimeMs: 1, size: file.size}
    })
    const sessionId = `conciv_${randomUUID()}`
    server.sessions.tokens.set(sessionId, randomUUID())
    const watch = await watchPresence(server, sessionId)

    await hook(server, 'Stop', {sessionId})
    await until(() => watch.seen.at(-1)?.state === 'connected')
    await until(() => file.reads >= 1)
    const beforeChanges = server.sessions.changes.count
    const seenAt = watch.seen.at(-1)?.lastSeenAt ?? 0

    file.growing = true
    await until(() => (watch.seen.at(-1)?.lastSeenAt ?? 0) > seenAt)
    expect(watch.seen.at(-1)?.state).toBe('connected')
    expect(server.sessions.changes.count).toBeGreaterThan(beforeChanges)
    await watch.stop()
  })

  it('marks a session as launching over rpc', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    expect((await server.rpc.launched({sessionId})).state).toBe('launching')
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})
  })
})
