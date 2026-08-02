import {randomUUID} from 'node:crypto'
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER, type UIMessage} from '@conciv/protocol/chat-types'
import {concivHooksPluginDir} from '@conciv/protocol/state-types'
import type {
  TranscriptChunk,
  TranscriptFailure,
  TranscriptHandle,
  TranscriptRevision,
} from '@conciv/protocol/harness-types'
import type {SessionSnapshot, SessionUpdate} from '@conciv/session-observer/types'
import {bashHarness, closeServersAfterEach, startTerminalServer, type TerminalTestServer} from './helpers.js'
import type {HOOK_EVENTS} from '../src/shared/protocol.js'

type HookEvent = (typeof HOOK_EVENTS)[number]

type FakeTranscript = {
  rev: string
  messages: UIMessage[]
  failure: TranscriptFailure | null
  handles: number
  closed: number
}

const open = closeServersAfterEach()

function fakeTranscript(): FakeTranscript {
  return {
    rev: 'r0',
    messages: [{id: 'h1', role: 'user', parts: [{type: 'text', content: 'hello'}]}],
    failure: null,
    handles: 0,
    closed: 0,
  }
}

function handleFor(state: FakeTranscript): TranscriptHandle {
  state.handles += 1
  return {
    revision: (): Promise<TranscriptRevision | TranscriptFailure> =>
      Promise.resolve(state.failure ?? {rev: state.rev, changedAt: 1}),
    read: (): Promise<TranscriptChunk | TranscriptFailure> =>
      Promise.resolve(
        state.failure ?? {ok: true, rev: state.rev, changedAt: 1, messages: [...state.messages], replaced: true},
      ),
    close: () => {
      state.closed += 1
    },
  }
}

async function startServer(transcript?: FakeTranscript, stateDir?: string): Promise<TerminalTestServer> {
  const server = await startTerminalServer(
    transcript ? {...bashHarness, observeTranscript: () => Promise.resolve(handleFor(transcript))} : bashHarness,
    '',
    stateDir,
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

type Watch = {updates: SessionUpdate[]; stop: () => Promise<void>}

function snapshots(watch: Watch): SessionSnapshot[] {
  return watch.updates.flatMap((update) => (update.kind === 'presence' ? [update.snapshot] : []))
}

async function watchSession(
  server: TerminalTestServer,
  sessionId: string,
  onUpdate: (update: SessionUpdate) => void = () => {},
): Promise<Watch> {
  const controller = new AbortController()
  const stream = await server.rpc.observe({sessionId}, {signal: controller.signal})
  const updates: SessionUpdate[] = []
  const opened = Promise.withResolvers<SessionSnapshot>()
  const pump = (async () => {
    for await (const update of stream) {
      updates.push(update)
      if (update.kind === 'presence') opened.resolve(update.snapshot)
      onUpdate(update)
    }
  })()
  const watch: Watch = {
    updates,
    stop: async () => {
      controller.abort()
      await pump.catch(() => {})
    },
  }
  await opened.promise
  return watch
}

describe('hooks that carry no conciv header', () => {
  it('routes the hook to the session that owns that claude session id', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const harnessSessionId = randomUUID()
    await server.sessions.recordToken(sessionId, harnessSessionId)
    const working = Promise.withResolvers<SessionSnapshot>()
    const watch = await watchSession(server, sessionId, (update) => {
      if (update.kind === 'presence' && update.snapshot.state === 'working') working.resolve(update.snapshot)
    })

    expect((await hook(server, 'UserPromptSubmit', {harnessSessionId})).status).toBe(200)
    expect((await working.promise).state).toBe('working')

    await watch.stop()
  }, 20_000)

  it('ignores a hook whose claude session belongs to nobody', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const watch = await watchSession(server, sessionId)

    expect((await hook(server, 'UserPromptSubmit', {harnessSessionId: randomUUID()})).status).toBe(200)
    expect(snapshots(watch).map((snapshot) => snapshot.state)).toEqual(['idle'])

    await watch.stop()
  }, 20_000)
})

describe('terminal observation', () => {
  it('starts idle and follows the claude hook lifecycle', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const presence = {notify: (_snapshot: SessionSnapshot) => {}}
    const watch = await watchSession(server, sessionId, (update) => {
      if (update.kind === 'presence') presence.notify(update.snapshot)
    })
    expect(snapshots(watch)[0]?.state).toBe('idle')

    const started = Promise.withResolvers<SessionSnapshot>()
    presence.notify = (snapshot) => {
      if (snapshot.state === 'connected') started.resolve(snapshot)
    }
    expect((await hook(server, 'SessionStart', {sessionId})).status).toBe(200)
    expect((await started.promise).evidence).toBe('hook')

    const working = Promise.withResolvers<SessionSnapshot>()
    presence.notify = (snapshot) => {
      if (snapshot.state === 'working') working.resolve(snapshot)
    }
    await hook(server, 'UserPromptSubmit', {sessionId})
    expect((await working.promise).state).toBe('working')

    const stopped = Promise.withResolvers<SessionSnapshot>()
    presence.notify = (snapshot) => {
      if (snapshot.state === 'connected') stopped.resolve(snapshot)
    }
    await hook(server, 'Stop', {sessionId})
    expect((await stopped.promise).state).toBe('connected')

    const ended = Promise.withResolvers<SessionSnapshot>()
    presence.notify = (snapshot) => {
      if (snapshot.state === 'idle') ended.resolve(snapshot)
    }
    await hook(server, 'SessionEnd', {sessionId})
    expect((await ended.promise).state).toBe('idle')
    await watch.stop()
  })

  it('blocks a working terminal outright and only asks once it stops', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})

    await hook(server, 'UserPromptSubmit', {sessionId})
    expect(server.sessions.runSend(sessionId, false)).toMatchObject({
      allow: false,
      kind: 'block',
      code: 'EXTERNAL_WORKING',
    })
    expect(server.sessions.runSend(sessionId, true)).toMatchObject({
      allow: false,
      kind: 'block',
      code: 'EXTERNAL_WORKING',
    })

    await hook(server, 'Stop', {sessionId})
    expect(server.sessions.runSend(sessionId, false)).toMatchObject({
      allow: false,
      kind: 'confirm',
      code: 'EXTERNAL_CONNECTED',
    })
    expect(server.sessions.runSend(sessionId, true)).toEqual({allow: true})

    await hook(server, 'SessionEnd', {sessionId})
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})
  })

  it('asks before sending into a session that is still launching', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    server.sessions.fireLaunch(sessionId)

    expect(server.sessions.runSend(sessionId, false)).toMatchObject({
      allow: false,
      kind: 'confirm',
      code: 'EXTERNAL_LAUNCHING',
    })
    expect(server.sessions.runSend(sessionId, true)).toEqual({allow: true})
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
    expect(await headerless.json()).toEqual({ok: true})
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})
  })

  it('keeps presence alive from an mcp request', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const working = Promise.withResolvers<SessionSnapshot>()
    const watch = await watchSession(server, sessionId, (update) => {
      if (update.kind === 'presence' && update.snapshot.state === 'working') working.resolve(update.snapshot)
    })
    server.sessions.fireMcpRequest(sessionId)
    expect((await working.promise).evidence).toBe('mcp')
    await watch.stop()
  })

  it('keeps mirroring a conciv turn without letting its own writes arm presence', async () => {
    const transcript = fakeTranscript()
    const server = await startServer(transcript)
    const sessionId = `conciv_${randomUUID()}`
    server.sessions.tokens.set(sessionId, randomUUID())
    const mirrored = {notify: (_messages: UIMessage[]) => {}}
    const firstTranscript = Promise.withResolvers<UIMessage[]>()
    const watch = await watchSession(server, sessionId, (update) => {
      if (update.kind !== 'transcript') return
      firstTranscript.resolve(update.messages)
      mirrored.notify(update.messages)
    })
    await firstTranscript.promise
    const beforeChanges = server.sessions.changes.count

    const grown = Promise.withResolvers<UIMessage[]>()
    mirrored.notify = (messages) => {
      if (messages.length === 2) grown.resolve(messages)
    }
    server.sessions.fireLocalRun(sessionId, 'start')
    transcript.rev = 'r1'
    transcript.messages = [
      ...transcript.messages,
      {id: 'h2', role: 'assistant', parts: [{type: 'text', content: 'hi there'}]},
    ]

    expect((await grown.promise).at(-1)?.id).toBe('h2')
    expect(snapshots(watch).at(-1)?.state).toBe('idle')
    expect(server.sessions.changes.count).toBe(beforeChanges)
    await watch.stop()
  }, 20_000)

  it('reports a transcript that cannot be read instead of an empty one', async () => {
    const transcript = fakeTranscript()
    transcript.failure = {ok: false, reason: 'unreadable', detail: 'EACCES'}
    const server = await startServer(transcript)
    const sessionId = `conciv_${randomUUID()}`
    server.sessions.tokens.set(sessionId, randomUUID())
    const failed = Promise.withResolvers<SessionUpdate>()
    const watch = await watchSession(server, sessionId, (update) => {
      if (update.kind === 'transcript-error') failed.resolve(update)
    })

    expect(await failed.promise).toMatchObject({reason: 'unreadable', detail: 'EACCES'})
    expect(watch.updates.some((update) => update.kind === 'transcript')).toBe(false)
    expect(snapshots(watch).at(-1)?.health.ok).toBe(false)
    await watch.stop()
  }, 20_000)

  it('drops presence when core reports the session was detached', async () => {
    const server = await startServer()
    const sessionId = `conciv_${randomUUID()}`
    const presence = {notify: (_snapshot: SessionSnapshot) => {}}
    const watch = await watchSession(server, sessionId, (update) => {
      if (update.kind === 'presence') presence.notify(update.snapshot)
    })
    const working = Promise.withResolvers<SessionSnapshot>()
    presence.notify = (snapshot) => {
      if (snapshot.state === 'working') working.resolve(snapshot)
    }
    await hook(server, 'UserPromptSubmit', {sessionId})
    expect((await working.promise).state).toBe('working')

    const dropped = Promise.withResolvers<SessionSnapshot>()
    presence.notify = (snapshot) => {
      if (snapshot.state === 'idle') dropped.resolve(snapshot)
    }
    server.sessions.fireSessionDetached(sessionId)
    expect((await dropped.promise).state).toBe('idle')
    expect(server.sessions.runSend(sessionId, false)).toEqual({allow: true})
    await watch.stop()
  }, 20_000)

  it('deletes the generated hooks plugin when claude reports SessionEnd', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'conciv-hooks-'))
    const server = await startServer(undefined, stateDir)
    const sessionId = `conciv_${randomUUID()}`
    const pluginDir = concivHooksPluginDir(stateDir, sessionId)
    mkdirSync(join(pluginDir, 'hooks'), {recursive: true})
    writeFileSync(join(pluginDir, 'hooks', 'hooks.json'), '{}')

    await hook(server, 'SessionStart', {sessionId})
    expect(existsSync(pluginDir)).toBe(true)

    await hook(server, 'SessionEnd', {sessionId})
    expect(existsSync(pluginDir)).toBe(false)
    rmSync(stateDir, {recursive: true, force: true})
  })

  it('releases every core listener and stops vetoing sends once disposed', async () => {
    const transcript = fakeTranscript()
    const server = await startServer(transcript)
    const sessionId = `conciv_${randomUUID()}`
    server.sessions.tokens.set(sessionId, randomUUID())
    const read = Promise.withResolvers<UIMessage[]>()
    const working = Promise.withResolvers<SessionSnapshot>()
    const watch = await watchSession(server, sessionId, (update) => {
      if (update.kind === 'transcript') read.resolve(update.messages)
      if (update.kind === 'presence' && update.snapshot.state === 'working') working.resolve(update.snapshot)
    })
    expect(await read.promise).toHaveLength(1)
    expect(transcript.handles).toBeGreaterThan(0)
    await hook(server, 'UserPromptSubmit', {sessionId})
    expect((await working.promise).state).toBe('working')
    expect(server.sessions.listeners).toEqual({localRun: 2, detached: 1, launch: 1, mcp: 1, veto: 1})
    await watch.stop()

    const sessions = server.sessions
    open.servers.splice(open.servers.indexOf(server), 1)
    await server.close()

    expect(sessions.listeners).toEqual({localRun: 0, detached: 0, launch: 0, mcp: 0, veto: 0})
    expect(transcript.closed).toBe(transcript.handles)
    expect(sessions.runSend(sessionId, false)).toEqual({allow: true})
  }, 20_000)
})
