import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {createRecordingTerminalOpener, createTestHarness, createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

type Captured = {server?: ServerApi<Record<never, never>>}

function probeExtension(name: string, captured: Captured) {
  return defineExtension({name}).server((server) => {
    captured.server = server
    return {context: {}}
  })
}

function serverOf(captured: Captured): ServerApi<Record<never, never>> {
  const server = captured.server
  if (!server) throw new Error('server api not captured')
  return server
}

async function bootProbe(name: string, env?: NodeJS.ProcessEnv): Promise<{kit: Kit; captured: Captured}> {
  const captured: Captured = {}
  const kit = await createTestkit(
    requireClaude(),
    bootCoreApp({extensions: [probeExtension(name, captured)], fakeClaude: {env: () => env ?? {}}}),
  ).setup()
  return {kit, captured}
}

describe('extension send veto', () => {
  it('denies chat.send with EXTERNAL_BLOCKED and stops once unregistered', async () => {
    const {kit, captured} = await bootProbe('veto-deny')
    try {
      const server = serverOf(captured)
      const unregister = server.sessions.beforeSend(() => ({
        allow: false,
        kind: 'block',
        code: 'EXTERNAL_WORKING',
        message: 'terminal owns this session',
      }))
      const sessionId = await kit.session()
      await expect(kit.rpc.chat.send({sessionId, text: 'hi'})).rejects.toMatchObject({
        code: 'EXTERNAL_BLOCKED',
        data: {code: 'EXTERNAL_WORKING'},
      })

      unregister()
      const accepted = await kit.rpc.chat.send({sessionId, text: 'hi again'})
      expect(accepted.ok).toBe(true)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('passes force through to the veto owner and lets an allow verdict send', async () => {
    const {kit, captured} = await bootProbe('veto-force')
    try {
      const server = serverOf(captured)
      const seen: {force: boolean}[] = []
      server.sessions.beforeSend((_id, opts) => {
        seen.push({force: opts.force})
        if (opts.force) return {allow: true}
        return {allow: false, kind: 'confirm', code: 'EXTERNAL_CONNECTED', message: 'external is open'}
      })
      const sessionId = await kit.session()
      await expect(kit.rpc.chat.send({sessionId, text: 'hi'})).rejects.toMatchObject({
        code: 'EXTERNAL_CONFIRM',
        data: {code: 'EXTERNAL_CONNECTED'},
      })
      const accepted = await kit.rpc.chat.send({sessionId, text: 'hi', force: true})
      expect(accepted.ok).toBe(true)
      expect(seen).toEqual([{force: false}, {force: true}])
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('lets a send through when a veto throws, and still honours a real veto', async () => {
    const {kit, captured} = await bootProbe('veto-throws')
    try {
      const server = serverOf(captured)
      server.sessions.beforeSend(() => {
        throw new Error('observer exploded')
      })
      const sessionId = await kit.session()
      const accepted = await kit.rpc.chat.send({sessionId, text: 'hi'})
      expect(accepted.ok).toBe(true)

      server.sessions.beforeSend(() => ({
        allow: false,
        kind: 'block',
        code: 'EXTERNAL_WORKING',
        message: 'terminal owns this session',
      }))
      await expect(kit.rpc.chat.send({sessionId, text: 'hi again'})).rejects.toMatchObject({
        code: 'EXTERNAL_BLOCKED',
        data: {code: 'EXTERNAL_WORKING'},
      })
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('reports the session id to the veto', async () => {
    const {kit, captured} = await bootProbe('veto-id')
    try {
      const server = serverOf(captured)
      const ids: string[] = []
      server.sessions.beforeSend((id) => {
        ids.push(id)
        return {allow: true}
      })
      const sessionId = await kit.session()
      await kit.rpc.chat.send({sessionId, text: 'hello'})
      expect(ids).toEqual([sessionId])
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})

describe('sessions.launch busy guard', () => {
  it('tells extensions a session was launched into a terminal', async () => {
    const {kit, captured} = await bootProbe('launch-seam')
    try {
      const server = serverOf(captured)
      const launched: string[] = []
      const unregister = server.sessions.onLaunch((id) => launched.push(id))
      const sessionId = await kit.session()

      await kit.rpc.sessions.launch({sessionId, open: false})
      expect(launched).toEqual([sessionId])

      await kit.rpc.sessions.connectCommand({sessionId})
      expect(launched).toEqual([sessionId, sessionId])

      unregister()
      await kit.rpc.sessions.launch({sessionId, open: false})
      expect(launched).toHaveLength(2)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('rejects a launch while a chat turn is running', async () => {
    const harness = createTestHarness(requireClaude())
    const kit = await createTestkit(harness, bootCoreApp()).setup()
    try {
      const sessionId = await kit.session()
      harness.script.hold()
      await kit.rpc.chat.send({sessionId, text: 'busy probe'})
      await expect(kit.rpc.sessions.launch({sessionId})).rejects.toMatchObject({code: 'BUSY'})
      harness.script.release()
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('launches once the session is idle, through the injected terminal opener', async () => {
    const terminal = createRecordingTerminalOpener()
    const kit = await createTestkit(requireClaude(), bootCoreApp({fakeClaude: {}, openTerminal: terminal.open})).setup()
    try {
      const sessionId = await kit.session()
      const launch = await kit.rpc.sessions.launch({sessionId})
      expect(launch.supported).toBe(true)
      expect(launch.opened).toBe(true)
      expect(terminal.opened).toHaveLength(1)
      const expectedBin =
        process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'x-terminal-emulator'
      expect(terminal.opened[0]?.bin).toBe(expectedBin)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('does not open a terminal when the caller asks for the command only', async () => {
    const terminal = createRecordingTerminalOpener()
    const kit = await createTestkit(requireClaude(), bootCoreApp({fakeClaude: {}, openTerminal: terminal.open})).setup()
    try {
      const sessionId = await kit.session()
      const launch = await kit.rpc.sessions.connectCommand({sessionId})
      expect(launch.command).toContain('claude')
      expect(terminal.opened).toEqual([])
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})

describe('mcp request seam', () => {
  it('fires onMcpRequest for a valid session header and stays quiet without one', async () => {
    const {kit, captured} = await bootProbe('mcp-seam')
    try {
      const server = serverOf(captured)
      const hits: string[] = []
      server.sessions.onMcpRequest((id) => hits.push(id))
      const sessionId = await kit.session()

      const anonymous = await createMCPClient({transport: {type: 'http', url: `${kit.base}/api/mcp`}})
      await anonymous.tools()
      await anonymous.close()
      expect(hits).toEqual([])

      const identified = await createMCPClient({
        transport: {type: 'http', url: `${kit.base}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: sessionId}},
      })
      await identified.tools()
      await identified.close()
      expect(hits.length).toBeGreaterThan(0)
      expect([...new Set(hits)]).toEqual([sessionId])
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})

describe('notifyChange seam', () => {
  it('wakes an attached stream with a fresh snapshot', async () => {
    const {kit, captured} = await bootProbe('notify-seam')
    try {
      const server = serverOf(captured)
      const sessionId = await kit.session()
      const abort = new AbortController()
      const stream = await kit.rpc.chat.attach({sessionId}, {signal: abort.signal})
      const iterator: AsyncIterator<StreamChunk> = stream[Symbol.asyncIterator]()
      const first = await iterator.next()
      expect(first.value?.type).toBe(EventType.MESSAGES_SNAPSHOT)

      server.sessions.notifyChange()
      const second = await iterator.next()
      expect(second.value?.type).toBe(EventType.MESSAGES_SNAPSHOT)
      abort.abort()
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})

describe('harness release', () => {
  it('aborts an in-flight run for the session', async () => {
    const {kit, captured} = await bootProbe('release-seam', {CONCIV_FAKE_HANG: '1'})
    try {
      const server = serverOf(captured)
      const runStarted = new Promise<string>((resolve) =>
        server.sessions.onLocalRun((id, phase) => {
          if (phase === 'start') resolve(id)
        }),
      )
      const runEnded = new Promise<string>((resolve) =>
        server.sessions.onLocalRun((id, phase) => {
          if (phase === 'end') resolve(id)
        }),
      )
      const sessionId = await kit.session()
      await kit.rpc.chat.send({sessionId, text: 'hang'})
      expect(await runStarted).toBe(sessionId)
      expect(server.sessions.chatBusy(sessionId)).toBe(true)

      server.harness.release?.(sessionId)
      expect(await runEnded).toBe(sessionId)
      expect(server.sessions.chatBusy(sessionId)).toBe(false)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
