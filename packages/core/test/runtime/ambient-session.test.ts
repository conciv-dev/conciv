import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineTool} from '@conciv/extension'
import {SessionId} from '@conciv/protocol/chat-types'
import type {EngineStaleness} from '@conciv/contract'
import {makeSessionPrimitives, type SessionPrimitives} from '../../src/runtime/primitives.js'
import {makeCoreRuntime} from '../../src/runtime/core-runtime.js'
import {runWithSession} from '../../src/runtime/session-context.js'
import type {CoreRuntime} from '../../src/runtime/scope-types.js'
import {makeCompactor} from '../../src/chat/run.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'

const SESSION_A = SessionId.parse('conciv_ambient_a')
const SESSION_B = SessionId.parse('conciv_ambient_b')

const FRESH: EngineStaleness = {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'test'}

const clicker = defineTool({
  name: 'fixture_click',
  description: 'Click something on the page',
  inputSchema: z.object({ref: z.string()}),
  outputSchema: z.object({clicked: z.string()}),
  meta: {summary: 'click a page element', category: 'fixture', mutating: true},
}).client()

async function madeRuntime(): Promise<{runtime: CoreRuntime; primitives: SessionPrimitives}> {
  const fixture = await makeChatFixture()
  const primitives = makeSessionPrimitives({
    db: fixture.db,
    root: fixture.stateRoot,
    storeCapture: () => Promise.resolve(),
    bundler: () => undefined,
    openInEditor: () => {},
  })
  primitives.registry.register(clicker, {owner: 'a fixture'})
  const runtime = makeCoreRuntime({
    primitives,
    chat: fixture.chat,
    compactor: makeCompactor(fixture.chat),
    model: () => null,
    staleness: () => FRESH,
  })
  return {runtime, primitives}
}

function requestIdOf(frame: unknown): string | null {
  if (typeof frame !== 'object' || frame === null || !('requestId' in frame)) return null
  return typeof frame.requestId === 'string' ? frame.requestId : null
}

function widgetOn(primitives: SessionPrimitives, id: SessionId, reply: Record<string, unknown>): () => void {
  return primitives.page.bus.subscribe(id, (frame) => {
    const requestId = requestIdOf(frame)
    if (requestId === null) return
    queueMicrotask(() => primitives.page.bus.resolve(id, requestId, {ok: true, result: reply}))
  })
}

function reachableIn(catalog: {list: () => {name: string; reachable: boolean}[]}, name: string): boolean | undefined {
  return catalog.list().find((entry) => entry.name === name)?.reachable
}

describe('the page forwarder reads its session from the established scope, not from its parameter', () => {
  it('refuses to run at all when no scope is established', async () => {
    const {primitives} = await madeRuntime()
    await expect(
      primitives.registry.call('fixture_click', {ref: 'r1'}, {request: {sessionId: SESSION_A, model: null}}),
    ).rejects.toThrow(/runWithSession/)
  })

  it('asks the widget of the established session even when the request names another one', async () => {
    const {runtime, primitives} = await madeRuntime()
    const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
    const result = await runWithSession(runtime.forSession(SESSION_A), () =>
      primitives.registry.call('fixture_click', {ref: 'r1'}, {request: {sessionId: SESSION_B, model: null}}),
    )
    expect(result).toEqual({clicked: 'a'})
    unsubscribe()
  })

  it('journals the mutation under the established session, not under the one the request names', async () => {
    const {runtime, primitives} = await madeRuntime()
    const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
    await runWithSession(runtime.forSession(SESSION_A), () =>
      primitives.registry.call('fixture_click', {ref: 'r1'}, {request: {sessionId: SESSION_B, model: null}}),
    )
    unsubscribe()
    expect(await runtime.forSession(SESSION_A).page.changes()).toHaveLength(1)
    expect(await runtime.forSession(SESSION_B).page.changes()).toHaveLength(0)
  })

  it('a scope method reaches the forwarder without any caller passing a session', async () => {
    const {runtime, primitives} = await madeRuntime()
    const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
    expect(await runtime.forSession(SESSION_A).tools.call('fixture_click', {ref: 'r1'})).toEqual({clicked: 'a'})
    unsubscribe()
  })
})

describe('catalog reachability is answered per scope', () => {
  it('a page tool is reachable for the session holding the widget and unreachable for another', async () => {
    const {runtime, primitives} = await madeRuntime()
    const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
    expect(reachableIn(runtime.forSession(SESSION_A).tools.catalog, 'fixture_click')).toBe(true)
    expect(reachableIn(runtime.forSession(SESSION_B).tools.catalog, 'fixture_click')).toBe(false)
    unsubscribe()
  })

  it('the engine catalog keeps the engine-wide answer', async () => {
    const {runtime, primitives} = await madeRuntime()
    const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
    const entry = runtime.engine.catalog().find((signature) => signature.name === 'fixture_click')
    expect(entry?.reachable).toBe(true)
    unsubscribe()
    expect(runtime.engine.catalog().find((signature) => signature.name === 'fixture_click')?.reachable).toBe(false)
  })
})
