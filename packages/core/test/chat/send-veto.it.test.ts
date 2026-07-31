import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {createMCPClient} from '@tanstack/ai-mcp'
import {defineExtension, type ServerApi} from '@conciv/extension'
import {createRecordingTerminalOpener, createTestHarness, createTestkit, until, type Kit} from '@conciv/harness-testkit'
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
  it('denies chat.send with EXTERNAL_ACTIVE and stops once unregistered', async () => {
    const {kit, captured} = await bootProbe('veto-deny')
    try {
      const server = serverOf(captured)
      const unregister = server.sessions.beforeSend(() => ({
        allow: false,
        code: 'EXTERNAL_ACTIVE',
        message: 'terminal owns this session',
      }))
      const sessionId = await kit.session()
      await expect(kit.rpc.chat.send({sessionId, text: 'hi'})).rejects.toMatchObject({code: 'EXTERNAL_ACTIVE'})

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
        return opts.force ? {allow: true} : {allow: false, code: 'EXTERNAL_ACTIVE', message: 'external is working'}
      })
      const sessionId = await kit.session()
      await expect(kit.rpc.chat.send({sessionId, text: 'hi'})).rejects.toMatchObject({code: 'EXTERNAL_ACTIVE'})
      const accepted = await kit.rpc.chat.send({sessionId, text: 'hi', force: true})
      expect(accepted.ok).toBe(true)
      expect(seen).toEqual([{force: false}, {force: true}])
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
      expect(terminal.opened[0]?.bin).toBe(process.platform === 'win32' ? 'cmd' : 'open')
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
      const sessionId = await kit.session()
      await kit.rpc.chat.send({sessionId, text: 'hang'})
      await until(() => server.sessions.chatBusy(sessionId), {hangGuardMs: 5000, settleFor: 500})

      server.harness.release?.(sessionId)
      await until(() => !server.sessions.chatBusy(sessionId), {hangGuardMs: 10_000})
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
