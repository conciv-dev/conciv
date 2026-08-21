import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {pageFailure, type PageOutcome} from '@conciv/protocol/page-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {makeBuiltinRegistry} from '../src/tool-registry.js'
import {makeJournal, type PageBus, type PageEnv} from '../src/page-bus.js'
import {testDb} from './helpers/memory-store.js'

const DeclaredFailure = z.object({code: z.string(), defined: z.boolean(), message: z.string()})

const SESSION = SessionId.parse('conciv_s7')

function envAsking(ask: PageBus['ask']): PageEnv {
  const bus: PageBus = {
    ask,
    connected: () => true,
    anySubscriber: () => false,
    resolve: (_sessionId: SessionId, _requestId: string, _outcome: PageOutcome) => false,
    subscribe: () => () => {},
  }
  return {journal: makeJournal(testDb()), root: '/repo', bus, storeCapture: async () => {}}
}

async function failureOf(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => {
      throw new Error('expected the call to fail')
    },
    (error: unknown) => error,
  )
}

describe('a built-in tool call carries who asked and how it failed', () => {
  it('carries the calling session into the page caller for a registry page tool', async () => {
    const seen: unknown[] = []
    const registry = createToolRegistry({
      pageCaller: async (_tool, _input, request) => {
        seen.push(request)
        return {ok: true, value: 'a@b.c'}
      },
    })
    for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a test registrant'})
    await registry.call(
      'page.fill',
      {selector: '#email', value: 'a@b.c'},
      {request: {sessionId: SESSION, model: 'sonnet'}},
    )
    expect(seen).toEqual([{sessionId: SESSION, model: 'sonnet'}])
  })

  it('reports a page handler failure as a declared HANDLER_ERROR that names the tool', async () => {
    const registry = makeBuiltinRegistry({
      page: envAsking(() => {
        throw pageFailure('handler-error', 'kaboom')
      }),
      bundler: () => undefined,
      openInEditor: () => {},
    })
    for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a test registrant'})
    const failure = DeclaredFailure.parse(
      await failureOf(registry.call('page.eval', {code: 'boom()'}, {request: {sessionId: SESSION, model: null}})),
    )
    expect(failure.code).toBe('HANDLER_ERROR')
    expect(failure.defined).toBe(true)
    expect(failure.message).toContain('page.eval')
  })

  it('journals mutating calls from declaration meta and leaves reads out', async () => {
    const answers: Record<string, unknown>[] = [{text: 'hi'}, {ok: true}]
    const env = envAsking(async () => ({result: answers.shift() ?? {}}))
    const registry = makeBuiltinRegistry({page: env, bundler: () => undefined, openInEditor: () => {}})
    for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a test registrant'})
    await registry.call('page.text', {selector: '#h'}, {request: {sessionId: SESSION, model: null}})
    await registry.call('page.click', {selector: '.btn'}, {request: {sessionId: SESSION, model: null}})
    expect(await env.journal.list(SESSION)).toMatchObject([{verb: 'page.click', selector: '.btn'}])
  })
})
