import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineTool, type ToolRequest} from '@conciv/extension'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {PageQuerySchema} from '@conciv/protocol/page-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {makeBuiltinRegistry} from '../src/tool-registry.js'
import {makeJournal, makePageBus, type PageEnv} from '../src/page-bus.js'
import {testDb} from './helpers/memory-store.js'
import {registryCapabilities, type CodeCapability} from '../src/chat/capabilities.js'
import {gatedToolRun} from '../src/chat/code-mode.js'
import {makeAskGate} from '../src/chat/gate.js'
import {createAskRegistry} from '../src/chat/ask.js'

const attached = () => true

const SESSION = SessionId.parse('conciv_s1')
const testRequest = {sessionId: SESSION, model: null}

const ApprovalChunkSchema = z.object({value: z.object({approval: z.object({id: z.string()})})})

function attrProbeTool() {
  return defineTool({
    name: 'probe.attr',
    description: 'probe read that can raise a declared error over the dispatcher seam',
    inputSchema: z.object({ref: z.string(), attribute: z.string()}),
    outputSchema: z.object({value: z.string()}),
    errors: {NO_ATTRIBUTE: {message: 'the element does not carry that attribute'}},
    meta: {summary: 'read an attribute over the dispatcher seam', category: 'read'},
  }).client()
}

function askProbeTool(ran: {value: boolean} = {value: false}) {
  return defineTool({
    name: 'probe.reset',
    description: 'destructive probe that declares it needs approval',
    inputSchema: z.object({}),
    outputSchema: z.object({ok: z.literal(true)}),
    approval: 'ask',
    meta: {summary: 'reset the probe state', category: 'extension', mutating: true},
  }).server((): {ok: true} => {
    ran.value = true
    return {ok: true}
  })
}

type BrowserPeer = (query: z.infer<typeof PageQuerySchema>) =>
  | {ok: true; result: Record<string, unknown>}
  | {
      ok: false
      error: {code: 'handler-error'; message: string; raised?: {code: string; message: string}}
    }

function bootRegistry(peer: BrowserPeer) {
  const env: PageEnv = {
    journal: makeJournal(testDb()),
    root: '/repo',
    bus: makePageBus(1_000),
    storeCapture: async () => {},
  }
  const frames: z.infer<typeof PageQuerySchema>[] = []
  env.bus.subscribe(SESSION, (frame) => {
    const query = PageQuerySchema.parse(frame)
    frames.push(query)
    const requestId = query.requestId
    if (requestId === undefined) throw new Error('the bus emitted a frame without a requestId')
    queueMicrotask(() => env.bus.resolve(SESSION, requestId, peer(query)))
  })
  const registry = makeBuiltinRegistry({page: env, bundler: () => undefined, openInEditor: () => {}})
  for (const def of PAGE_TOOL_DEFS) registry.register(def.client(), {owner: 'a built-in page tool'})
  registry.register(attrProbeTool(), {owner: 'a test registrant'})
  return {registry, env, frames}
}

function scopedCall(registry: ReturnType<typeof makeBuiltinRegistry>) {
  return (name: string, input: unknown, request: ToolRequest) => registry.call(name, input, {request})
}

function capabilityNamed(capabilities: CodeCapability[], name: string): CodeCapability {
  const found = capabilities.find((capability) => capability.name === name)
  if (!found) throw new Error(`no capability named ${name}`)
  return found
}

describe('registry page tools ride the final {requestId, name, input} envelope over the page bus', () => {
  it('forwards the registry name and the nested validated input, and returns the browser result', async () => {
    const {registry, frames} = bootRegistry(() => ({ok: true, result: {text: 'hello'}}))
    await expect(registry.call('page.text', {selector: '#probe'}, {request: testRequest})).resolves.toEqual({
      text: 'hello',
    })
    expect(frames).toMatchObject([{name: 'page.text', input: {selector: '#probe'}}])
  })

  it('journals a mutating call from the declaration meta and leaves reads out of the journal', async () => {
    const {registry, env} = bootRegistry((query) =>
      query.name === 'page.click' ? {ok: true, result: {ok: true}} : {ok: true, result: {text: ''}},
    )
    await registry.call('page.text', {selector: '#probe'}, {request: testRequest})
    await registry.call('page.click', {selector: '#go'}, {request: testRequest})
    expect(await env.journal.list(SESSION)).toMatchObject([{verb: 'page.click', selector: '#go'}])
  })

  it('rebuilds a browser-raised toolError into the declared error', async () => {
    const {registry} = bootRegistry(() => ({
      ok: false,
      error: {code: 'handler-error', message: 'no attr', raised: {code: 'NO_ATTRIBUTE', message: 'no attr'}},
    }))
    await expect(
      registry.call('probe.attr', {ref: 'v1', attribute: 'data-none'}, {request: testRequest}),
    ).rejects.toMatchObject({
      code: 'NO_ATTRIBUTE',
    })
  })
})

describe('page tools pass gatedToolRun ungated; only approval-declared capabilities prompt', () => {
  it('a mutating page tool runs without any approval ask', async () => {
    const {registry, frames} = bootRegistry(() => ({ok: true, result: {ok: true}}))
    const asks = createAskRegistry()
    const emitted: unknown[] = []
    const gate = makeAskGate({sessionId: SESSION, asks, emit: (chunk) => emitted.push(chunk), timeoutMs: 5_000})
    const click = capabilityNamed(registryCapabilities(registry, scopedCall(registry)), 'page.click')
    expect(click.mutating).toBe(true)
    expect(click.approval).toBeUndefined()
    await expect(gatedToolRun(click, testRequest, gate, attached)({selector: '#go'})).resolves.toMatchObject({
      ok: true,
    })
    expect(emitted).toEqual([])
    expect(frames).toMatchObject([{name: 'page.click'}])
  })

  it('an approval-declared capability prompts, and approval releases it', async () => {
    const {registry} = bootRegistry(() => ({ok: true, result: {ok: true}}))
    registry.register(askProbeTool(), {owner: 'a test registrant'})
    const asks = createAskRegistry()
    const holder = {settle: (_chunk: unknown): void => {}}
    const chunkArrived = new Promise<unknown>((resolve) => {
      holder.settle = resolve
    })
    const gate = makeAskGate({sessionId: SESSION, asks, emit: (chunk) => holder.settle(chunk), timeoutMs: 5_000})
    const reset = capabilityNamed(registryCapabilities(registry, scopedCall(registry)), 'probe.reset')
    expect(reset.approval).toBe('ask')
    const pending = gatedToolRun(reset, testRequest, gate, attached)({})
    const chunk = ApprovalChunkSchema.parse(await chunkArrived)
    expect(asks.reply(SESSION, chunk.value.approval.id, true)).toBe(true)
    await expect(pending).resolves.toEqual({ok: true})
  })

  it('a denied ask blocks the approval-declared capability before it runs', async () => {
    const {registry} = bootRegistry(() => ({ok: true, result: {ok: true}}))
    const ran = {value: false}
    registry.register(askProbeTool(ran), {owner: 'a test registrant'})
    const asks = createAskRegistry()
    const holder = {settle: (_chunk: unknown): void => {}}
    const chunkArrived = new Promise<unknown>((resolve) => {
      holder.settle = resolve
    })
    const gate = makeAskGate({sessionId: SESSION, asks, emit: (chunk) => holder.settle(chunk), timeoutMs: 5_000})
    const reset = capabilityNamed(registryCapabilities(registry, scopedCall(registry)), 'probe.reset')
    const pending = gatedToolRun(reset, testRequest, gate, attached)({})
    const chunk = ApprovalChunkSchema.parse(await chunkArrived)
    expect(asks.reply(SESSION, chunk.value.approval.id, false)).toBe(true)
    await expect(pending).rejects.toThrow(/denied/)
    expect(ran.value).toBe(false)
  })

  it('a read tool never consults the gate', async () => {
    const {registry} = bootRegistry(() => ({ok: true, result: {text: 'hello'}}))
    const asks = createAskRegistry()
    const gate = makeAskGate({sessionId: SESSION, asks, emit: () => {}, timeoutMs: 100})
    const text = capabilityNamed(registryCapabilities(registry, scopedCall(registry)), 'page.text')
    expect(text.mutating).toBe(false)
    const run = gatedToolRun(text, testRequest, gate, attached)
    await expect(run({selector: '#probe'})).resolves.toMatchObject({text: 'hello'})
  })
})
