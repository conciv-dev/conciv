import {afterEach, describe, expect, it} from 'vitest'
import {tmpdir} from 'node:os'
import type {PageOutcome} from '@conciv/protocol/page-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {approvalIds, createTestHarness, makeRpcClient, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'
import {connectWidget, type FakeWidget} from '../helpers/fake-widget.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function answerFor(name: string): PageOutcome {
  if (name === 'page.effect') return {ok: true, result: {effect: 'highlight', enabled: true}}
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

describe('the chat surface gates mutating page tools and lets reads through', () => {
  it('a chat turn running page.effect prompts, and approval releases the call to the page', async () => {
    const {kit, harness} = await bootScripted()
    const widget = await bootWidget(kit)
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callThroughCatalog('page.effect', {action: 'enable', effect: 'highlight'}),
    })
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'gate-chat-1', sessionId, text: 'light it up'})
    const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 15_000})
    expect(widget.seen()).toEqual([])
    const approvalId = approvalIds(asked)[0]
    if (approvalId === undefined) throw new Error('no approval id in the snapshot')
    await kit.rpc.chat.permissionDecision({approvalId, approved: true})
    await stream.done({hangGuardMs: 15_000})
    expect(widget.seen()).toEqual(['page.effect'])
  }, 40_000)

  it('a chat turn running page.text completes without consulting the gate', async () => {
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

describe('the code-mode surface (execute_typescript over /api/mcp) gates the same way', () => {
  it('page.effect prompts and an approval lets the script finish', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    cleanups.push(() => kit.cleanup())
    const widget = await bootWidget(kit)
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    const pending = kit.callTool('page.effect', {action: 'enable', effect: 'highlight'}, sessionId)
    const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 15_000})
    expect(widget.seen()).toEqual([])
    const approvalId = approvalIds(asked)[0]
    if (approvalId === undefined) throw new Error('no approval id in the snapshot')
    await kit.rpc.chat.permissionDecision({approvalId, approved: true})
    await expect(pending).resolves.toMatchObject({effect: 'highlight', enabled: true})
    expect(widget.seen()).toEqual(['page.effect'])
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

describe('the CLI surface (registry.call over /rpc) gates the same way', () => {
  async function bootCliSurface(): Promise<{kit: Kit; widget: FakeWidget; sessionId: string}> {
    const kit = await bootKit({cwd: tmpdir()})
    cleanups.push(() => kit.cleanup())
    const widget = await bootWidget(kit)
    const sessionId = await kit.session()
    return {kit, widget, sessionId}
  }

  function sessionRpcOf(kit: Kit, sessionId: string): ReturnType<typeof makeRpcClient> {
    return makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
  }

  it('page.effect prompts and an approval releases the call to the page', async () => {
    const {kit, widget, sessionId} = await bootCliSurface()
    const stream = await kit.attach(sessionId)
    const rpc = sessionRpcOf(kit, sessionId)
    const pending = rpc.registry.call({name: 'page.effect', input: {action: 'enable', effect: 'highlight'}})
    const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 15_000})
    expect(widget.seen()).toEqual([])
    const approvalId = approvalIds(asked)[0]
    if (approvalId === undefined) throw new Error('no approval id in the snapshot')
    await kit.rpc.chat.permissionDecision({approvalId, approved: true})
    await expect(pending).resolves.toMatchObject({effect: 'highlight', enabled: true})
    expect(widget.seen()).toEqual(['page.effect'])
  }, 40_000)

  it('a denial rejects the call and the page never sees it', async () => {
    const {kit, widget, sessionId} = await bootCliSurface()
    const stream = await kit.attach(sessionId)
    const rpc = sessionRpcOf(kit, sessionId)
    const pending = rpc.registry.call({name: 'page.effect', input: {action: 'enable', effect: 'highlight'}})
    const asked = await stream.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 15_000})
    const approvalId = approvalIds(asked)[0]
    if (approvalId === undefined) throw new Error('no approval id in the snapshot')
    await kit.rpc.chat.permissionDecision({approvalId, approved: false})
    await expect(pending).rejects.toMatchObject({code: 'APPROVAL_DENIED'})
    expect(widget.seen()).toEqual([])
  }, 40_000)

  it('page.text resolves without ever emitting an approval ask', async () => {
    const {kit, widget, sessionId} = await bootCliSurface()
    const approvals = pumpApprovals(kit, sessionId)
    const rpc = sessionRpcOf(kit, sessionId)
    await expect(rpc.registry.call({name: 'page.text', input: {selector: '#probe'}})).resolves.toMatchObject({
      text: 'page-gate-ok',
    })
    expect(widget.seen()).toEqual(['page.text'])
    expect(approvals.ids()).toEqual([])
  }, 40_000)

  it('a sessionless mutating call is refused before it reaches the page', async () => {
    const {kit, widget} = await bootCliSurface()
    await expect(
      kit.rpc.registry.call({name: 'page.effect', input: {action: 'enable', effect: 'highlight'}}),
    ).rejects.toMatchObject({code: 'APPROVAL_DENIED'})
    expect(widget.seen()).toEqual([])
  }, 40_000)
})
