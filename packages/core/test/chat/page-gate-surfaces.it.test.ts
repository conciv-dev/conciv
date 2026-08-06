import {afterEach, describe, expect, it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {tmpdir} from 'node:os'
import type {PageOutcome} from '@conciv/protocol/page-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {
  approvalIds,
  createTestHarness,
  makeApprovingRegistryCall,
  makeRpcClient,
  type Kit,
  type TestHarness,
} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'
import {connectWidget, type FakeWidget} from '../helpers/fake-widget.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function answerFor(name: string): PageOutcome {
  if (name === 'page.effect') return {ok: true, result: {effect: 'highlight', enabled: true}}
  if (name === 'page.fill') return {ok: true, result: {ok: true, value: 'a@b.c'}}
  return {ok: true, result: {text: 'page-gate-ok'}}
}

async function bootWidget(kit: Kit): Promise<FakeWidget> {
  const widget = await connectWidget(kit, answerFor)
  cleanups.push(async () => widget.end())
  return widget
}

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input)})
  `
}

async function bootScripted(): Promise<{kit: Kit; harness: TestHarness}> {
  const harness = createTestHarness(requireClaude())
  const kit = await bootKit({cwd: tmpdir()}, harness)
  cleanups.push(() => kit.cleanup())
  return {kit, harness}
}

function pumpApprovals(kit: Kit, sessionId: string): {ids: () => string[]} {
  const ctrl = new AbortController()
  const collected: string[] = []
  const pump = (async () => {
    const stream = await kit.rpc.chat.subscribe({sessionId}, {signal: ctrl.signal})
    for await (const chunk of stream) collected.push(...approvalIds(chunk))
  })()
  cleanups.push(async () => {
    ctrl.abort()
    await pump.catch(() => {})
  })
  return {ids: () => [...collected]}
}

describe('the chat surface runs page tools without ever consulting a gate', () => {
  it('a chat turn running page.effect enable completes with zero approval chunks', async () => {
    const {kit, harness} = await bootScripted()
    const widget = await bootWidget(kit)
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callThroughCatalog('page.effect', {action: 'enable', effect: 'highlight'}),
    })
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'gate-chat-1', sessionId, text: 'light it up'})
    const events = await stream.done({hangGuardMs: 15_000})
    expect(events.all.flatMap((chunk) => approvalIds(chunk))).toEqual([])
    expect(widget.seen()).toEqual(['page.effect'])
  }, 40_000)

  it('a chat turn running page.text completes the same way', async () => {
    const {kit, harness} = await bootScripted()
    const widget = await bootWidget(kit)
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callThroughCatalog('page.text', {selector: '#probe'}),
    })
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'gate-chat-2', sessionId, text: 'read it'})
    const events = await stream.done({hangGuardMs: 15_000})
    expect(events.all.flatMap((chunk) => approvalIds(chunk))).toEqual([])
    expect(widget.seen()).toEqual(['page.text'])
  }, 40_000)
})

describe('the code-mode surface (execute_typescript over /api/mcp) runs page tools ungated', () => {
  it('page.effect enable resolves without ever emitting an approval ask', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    cleanups.push(() => kit.cleanup())
    const widget = await bootWidget(kit)
    const sessionId = await kit.session()
    const approvals = pumpApprovals(kit, sessionId)
    await expect(
      kit.callTool('page.effect', {action: 'enable', effect: 'highlight'}, sessionId),
    ).resolves.toMatchObject({effect: 'highlight', enabled: true})
    expect(widget.seen()).toEqual(['page.effect'])
    expect(approvals.ids()).toEqual([])
  }, 40_000)

  it('page.text resolves without ever emitting an approval ask', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    cleanups.push(() => kit.cleanup())
    const widget = await bootWidget(kit)
    const sessionId = await kit.session()
    const approvals = pumpApprovals(kit, sessionId)
    await expect(kit.callTool('page.text', {selector: '#probe'}, sessionId)).resolves.toMatchObject({
      text: 'page-gate-ok',
    })
    expect(widget.seen()).toEqual(['page.text'])
    expect(approvals.ids()).toEqual([])
  }, 40_000)
})

describe('the RPC surface (registry.call) runs page tools ungated and still journals mutations', () => {
  it('a headerless mutating page call executes without approval', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    cleanups.push(() => kit.cleanup())
    const widget = await bootWidget(kit)
    await expect(
      kit.rpc.registry.call({name: 'page.effect', input: {action: 'enable', effect: 'highlight'}}),
    ).resolves.toMatchObject({effect: 'highlight', enabled: true})
    expect(widget.seen()).toEqual(['page.effect'])
  }, 40_000)

  it('page.fill lands in the journal: mutating stays bookkeeping, not a gate', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    cleanups.push(() => kit.cleanup())
    const widget = await bootWidget(kit)
    await expect(
      kit.rpc.registry.call({name: 'page.fill', input: {selector: '#email', value: 'a@b.c'}}),
    ).resolves.toMatchObject({ok: true})
    expect(widget.seen()).toEqual(['page.fill'])
    const changes = await kit.rpc.page.changes(undefined)
    expect(changes.map((entry) => entry.verb)).toEqual(['page.fill'])
  }, 40_000)
})

describe('approval-declared tools gate at the RPC boundary (server.restart)', () => {
  function restartBridge() {
    return defineBundlerBridge({
      id: 'gate-test',
      config: () => ({root: '/repo', base: '/', mode: 'development', aliases: [], plugins: []}),
      resolve: async (spec) => ({id: spec}),
      moduleGraph: () => [],
      transform: async () => ({code: null}),
      urls: () => ({local: [], network: []}),
      reload: async () => {},
      restart: async () => {},
    })
  }

  async function bootGated(): Promise<Kit> {
    const kit = await bootKit({cwd: tmpdir(), bridge: restartBridge()})
    cleanups.push(() => kit.cleanup())
    return kit
  }

  async function createdSession(kit: Kit): Promise<string> {
    const {sessionId} = await kit.rpc.sessions.create(undefined)
    return sessionId
  }

  function sessionRpcOf(kit: Kit, sessionId: string): ReturnType<typeof makeRpcClient> {
    return makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
  }

  it('a sessionless call is refused before the tool runs', async () => {
    const kit = await bootGated()
    await expect(kit.rpc.server.restart({})).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: expect.stringContaining('no session is attached'),
    })
  }, 40_000)

  it('a session that does not exist is refused', async () => {
    const kit = await bootGated()
    const rpc = sessionRpcOf(kit, `conciv_${randomUUID()}`)
    await expect(rpc.server.restart({})).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: expect.stringContaining('does not exist'),
    })
  }, 40_000)

  it('a live session with no attached UI is refused fast instead of hanging', async () => {
    const kit = await bootGated()
    const sessionId = await createdSession(kit)
    const rpc = sessionRpcOf(kit, sessionId)
    await expect(rpc.server.restart({})).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: expect.stringContaining('nothing is attached'),
    })
  }, 40_000)

  async function askedRestart(): Promise<{kit: Kit; sessionId: string; pending: Promise<unknown>; approvalId: string}> {
    const kit = await bootGated()
    const sessionId = await createdSession(kit)
    const stream = await kit.attach(sessionId)
    const rpc = sessionRpcOf(kit, sessionId)
    const pending = rpc.server.restart({})
    const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 15_000})
    const approvalId = approvalIds(asked)[0]
    if (approvalId === undefined) throw new Error('no approval id in the stream')
    return {kit, sessionId, pending, approvalId}
  }

  it('the ask reaches the named session and an approval releases the call', async () => {
    const {kit, pending, approvalId} = await askedRestart()
    await kit.rpc.chat.permissionDecision({approvalId, approved: true})
    await expect(pending).resolves.toEqual({ok: true})
  }, 40_000)

  it('a denial rejects with the denial wording', async () => {
    const {kit, pending, approvalId} = await askedRestart()
    await kit.rpc.chat.permissionDecision({approvalId, approved: false})
    await expect(pending).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: expect.stringContaining('denied by the user'),
    })
  }, 40_000)

  it('a stopped session settles the ask as no-decision, not a lie about the user denying', async () => {
    const {kit, sessionId, pending} = await askedRestart()
    await kit.rpc.chat.stop({sessionId})
    await expect(pending).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: expect.stringContaining('no approval decision'),
    })
  }, 40_000)

  it('registry.call gates the same declaration through the same helper', async () => {
    const kit = await bootGated()
    const sessionId = await createdSession(kit)
    await expect(makeApprovingRegistryCall(kit.base, sessionId)('server.restart', {})).resolves.toEqual({ok: true})
  }, 40_000)
})
