import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineTool} from '@conciv/extension'
import {PageToolQuerySchema} from '@conciv/protocol/page-types'
import {makeBuiltinRegistry} from '../src/tool-registry.js'
import {makeJournal, makePageBus, type PageEnv} from '../src/page-bus.js'
import {registryCapabilities, type CodeCapability} from '../src/chat/capabilities.js'
import {gatedToolRun} from '../src/chat/code-mode.js'
import {makeAskGate} from '../src/chat/gate.js'
import {createAskRegistry} from '../src/chat/ask.js'

const ApprovalChunkSchema = z.object({value: z.object({approval: z.object({id: z.string()})})})

function spikeTextTool() {
  return defineTool({
    name: 'pagespike.text',
    description: 'spike read over the client-tool dispatcher',
    inputSchema: z.object({selector: z.string()}),
    outputSchema: z.object({text: z.string()}),
    meta: {summary: 'read text over the spike dispatcher', category: 'read'},
  }).client(() => ({text: ''}))
}

function spikeClickTool() {
  return defineTool({
    name: 'pagespike.click',
    description: 'spike act over the client-tool dispatcher',
    inputSchema: z.object({selector: z.string()}),
    outputSchema: z.object({clicked: z.boolean()}),
    errors: {NOT_CLICKABLE: {message: 'the target is not an HTMLElement'}},
    meta: {summary: 'click over the spike dispatcher', category: 'act', mutating: true, mirrors: true},
  }).client(() => ({clicked: true}))
}

function spikeAttrTool() {
  return defineTool({
    name: 'pagespike.attr',
    description: 'spike ref read over the client-tool dispatcher',
    inputSchema: z.object({ref: z.string(), attribute: z.string()}),
    outputSchema: z.object({value: z.string()}),
    errors: {NO_ATTRIBUTE: {message: 'the element does not carry that attribute'}},
    meta: {summary: 'read an attribute over the spike dispatcher', category: 'read'},
  }).client(() => ({value: ''}))
}

type BrowserPeer = (query: z.infer<typeof PageToolQuerySchema>) =>
  | {ok: true; result: Record<string, unknown>}
  | {
      ok: false
      error: {code: 'handler-error'; message: string; raised?: {code: string; message: string}}
    }

function bootSpikeRegistry(peer: BrowserPeer) {
  const env: PageEnv = {journal: makeJournal(), root: '/repo', bus: makePageBus(1_000)}
  const frames: z.infer<typeof PageToolQuerySchema>[] = []
  env.bus.subscribe((frame) => {
    const query = PageToolQuerySchema.parse(frame)
    frames.push(query)
    const requestId = query.requestId
    if (requestId === undefined) throw new Error('the bus emitted a frame without a requestId')
    queueMicrotask(() => env.bus.resolve(requestId, peer(query)))
  })
  const registry = makeBuiltinRegistry({page: env, bundler: () => undefined, openInEditor: () => {}})
  registry.register(spikeTextTool())
  registry.register(spikeClickTool())
  registry.register(spikeAttrTool())
  return {registry, env, frames}
}

function capabilityNamed(capabilities: CodeCapability[], name: string): CodeCapability {
  const found = capabilities.find((capability) => capability.name === name)
  if (!found) throw new Error(`no capability named ${name}`)
  return found
}

describe('client tools ride the {kind: tool} envelope over the page bus', () => {
  it('forwards the registry name and the nested validated input, and returns the browser result', async () => {
    const {registry, frames} = bootSpikeRegistry(() => ({ok: true, result: {text: 'hello'}}))
    await expect(registry.call('pagespike.text', {selector: '#probe'})).resolves.toEqual({text: 'hello'})
    expect(frames).toMatchObject([{kind: 'tool', name: 'pagespike.text', input: {selector: '#probe'}}])
  })

  it('journals a mutating call from the declaration meta and leaves reads out of the journal', async () => {
    const {registry, env} = bootSpikeRegistry((query) =>
      query.name === 'pagespike.click' ? {ok: true, result: {clicked: true}} : {ok: true, result: {text: ''}},
    )
    await registry.call('pagespike.text', {selector: '#probe'})
    await registry.call('pagespike.click', {selector: '#spike-btn'})
    expect(env.journal.list()).toMatchObject([{verb: 'pagespike.click', selector: '#spike-btn'}])
  })

  it('rebuilds a browser-raised toolError into the declared error', async () => {
    const {registry} = bootSpikeRegistry(() => ({
      ok: false,
      error: {code: 'handler-error', message: 'no attr', raised: {code: 'NO_ATTRIBUTE', message: 'no attr'}},
    }))
    await expect(registry.call('pagespike.attr', {ref: 'v1', attribute: 'data-none'})).rejects.toMatchObject({
      code: 'NO_ATTRIBUTE',
    })
  })
})

describe('the mutating spike verb prompts through the same decide() gate path as extension tools', () => {
  it('emits an approval ask for the mutating verb and forwards after approval', async () => {
    const {registry} = bootSpikeRegistry(() => ({ok: true, result: {clicked: true}}))
    const asks = createAskRegistry()
    const holder = {settle: (_chunk: unknown): void => {}}
    const chunkArrived = new Promise<unknown>((resolve) => {
      holder.settle = resolve
    })
    const gate = makeAskGate({sessionId: 's1', asks, emit: (chunk) => holder.settle(chunk), timeoutMs: 5_000})
    const click = capabilityNamed(registryCapabilities(registry), 'pagespike.click')
    expect(click.mutating).toBe(true)
    const pending = gatedToolRun(click, {sessionId: 's1', model: null}, gate)({selector: '#spike-btn'})
    const chunk = ApprovalChunkSchema.parse(await chunkArrived)
    expect(asks.reply('s1', chunk.value.approval.id, true)).toBe(true)
    await expect(pending).resolves.toMatchObject({clicked: true})
  })

  it('a denied ask blocks the mutating verb before it reaches the page', async () => {
    const {registry, frames} = bootSpikeRegistry(() => ({ok: true, result: {clicked: true}}))
    const asks = createAskRegistry()
    const holder = {settle: (_chunk: unknown): void => {}}
    const chunkArrived = new Promise<unknown>((resolve) => {
      holder.settle = resolve
    })
    const gate = makeAskGate({sessionId: 's1', asks, emit: (chunk) => holder.settle(chunk), timeoutMs: 5_000})
    const click = capabilityNamed(registryCapabilities(registry), 'pagespike.click')
    const pending = gatedToolRun(click, {sessionId: 's1', model: null}, gate)({selector: '#spike-btn'})
    const chunk = ApprovalChunkSchema.parse(await chunkArrived)
    expect(asks.reply('s1', chunk.value.approval.id, false)).toBe(true)
    await expect(pending).rejects.toThrow(/denied/)
    expect(frames).toEqual([])
  })

  it('a read verb never consults the gate', async () => {
    const {registry} = bootSpikeRegistry(() => ({ok: true, result: {text: 'hello'}}))
    const asks = createAskRegistry()
    const gate = makeAskGate({sessionId: '', asks, emit: () => {}, timeoutMs: 100})
    const text = capabilityNamed(registryCapabilities(registry), 'pagespike.text')
    expect(text.mutating).toBe(false)
    const run = gatedToolRun(text, {sessionId: '', model: null}, gate)
    await expect(run({selector: '#probe'})).resolves.toMatchObject({text: 'hello'})
  })
})
