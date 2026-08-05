import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createToolRegistry} from '@conciv/extension/registry'
import {BUILTIN_PAGE_TOOLS} from '@conciv/tools/builtins'
import {pageFailure, type PageOutcome} from '@conciv/protocol/page-types'
import {callPageTool, makeBuiltinRegistry} from '../src/tool-registry.js'
import {makeJournal, type PageBus, type PageEnv} from '../src/page-bus.js'

const DeclaredFailure = z.object({code: z.string(), defined: z.boolean(), message: z.string()})

function envAsking(ask: PageBus['ask']): PageEnv {
  const bus: PageBus = {
    ask,
    connected: () => true,
    resolve: (_requestId: string, _outcome: PageOutcome) => false,
    subscribe: () => () => {},
  }
  return {journal: makeJournal(), root: '/repo', bus}
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
  it('carries the calling session into the page caller for a built-in page tool', async () => {
    const seen: unknown[] = []
    const registry = createToolRegistry({
      pageCaller: async (_tool, _input, request) => {
        seen.push(request)
        return {ok: true, value: 'a@b.c'}
      },
    })
    for (const tool of BUILTIN_PAGE_TOOLS) registry.register(tool)
    const env = envAsking(async () => ({}))
    await callPageTool(
      registry,
      env,
      {kind: 'fill', selector: '#email', value: 'a@b.c'},
      {
        sessionId: 's7',
        model: 'sonnet',
      },
    )
    expect(seen).toEqual([{sessionId: 's7', model: 'sonnet'}])
  })

  it('reports a page handler failure as a declared HANDLER_ERROR that names the tool', async () => {
    const registry = makeBuiltinRegistry({
      page: envAsking(() => {
        throw pageFailure('handler-error', 'kaboom')
      }),
      bundler: () => undefined,
      openInEditor: () => {},
    })
    const failure = DeclaredFailure.parse(await failureOf(registry.call('page.eval', {code: 'boom()'})))
    expect(failure.code).toBe('HANDLER_ERROR')
    expect(failure.defined).toBe(true)
    expect(failure.message).toContain('page.eval')
  })
})
