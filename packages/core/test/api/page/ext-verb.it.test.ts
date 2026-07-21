import {afterEach, describe, expect, it} from 'vitest'
import {tmpdir} from 'node:os'
import {z} from 'zod'
import {defineExtension, definePageVerbs, isPageVerbError, pageVerb, type PageCaller} from '@conciv/extension'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'

const pingVerbs = definePageVerbs({
  ping: pageVerb(z.object({n: z.number()}), (args) => ({pong: args.n + 1})),
})

type WidgetReply = Record<string, unknown>
type ReplyFor = (query: {kind: string; extension?: string; verb?: string; argsJson?: string}) => WidgetReply

type SeenQuery = {kind: string; extension?: string; verb?: string; argsJson?: string}

function seenQuery(query: unknown): SeenQuery | null {
  if (typeof query !== 'object' || query === null || !('kind' in query) || typeof query.kind !== 'string') return null
  const shape = query as SeenQuery
  return {kind: shape.kind, extension: shape.extension, verb: shape.verb, argsJson: shape.argsJson}
}

async function connectWidget(kit: Kit, replyFor: ReplyFor): Promise<{seen: SeenQuery[]; end: () => void}> {
  const ctrl = new AbortController()
  const seen: SeenQuery[] = []
  const iterator = await kit.rpc.page.queries(undefined, {signal: ctrl.signal})
  void (async () => {
    try {
      for await (const {requestId, query} of iterator) {
        const shape = seenQuery(query)
        if (!shape) continue
        seen.push(shape)
        void kit.rpc.page.reply({requestId, data: replyFor(shape)}).catch(() => {})
      }
    } catch {}
  })()
  return {seen, end: () => ctrl.abort()}
}

describe('server.page.call end to end (IT, real core app + real page bus + real wire)', () => {
  const state = {
    kit: undefined as Kit | undefined,
    widget: undefined as {end: () => void} | undefined,
    page: undefined as PageCaller<typeof pingVerbs> | undefined,
  }

  afterEach(async () => {
    state.widget?.end()
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    state.widget = undefined
    state.page = undefined
  })

  async function boot(): Promise<Kit> {
    const pinger = defineExtension({name: 'pinger'})
      .client(() => ({value: {}, pageVerbs: pingVerbs}))
      .server((server) => {
        state.page = server.page
        return {context: {}}
      })
    const kit = await bootKit({cwd: tmpdir(), extensions: [pinger]})
    state.kit = kit
    return kit
  }

  it('routes a server page-verb call through the bus to the widget and returns its result', async () => {
    const kit = await boot()
    const widget = await connectWidget(kit, (query) => {
      if (query.kind !== 'ext') return {}
      const raw = query.argsJson ? JSON.parse(query.argsJson) : {}
      const parsed = pingVerbs.ping.args.safeParse(raw)
      if (!parsed.success) return {error: {code: 'invalid-args', message: parsed.error.message}}
      return {result: pingVerbs.ping.handler(parsed.data)}
    })
    state.widget = widget
    if (!state.page) throw new Error('server page caller not captured')
    expect(await state.page.call('ping', {n: 41})).toEqual({pong: 42})
    expect(widget.seen).toContainEqual({kind: 'ext', extension: 'pinger', verb: 'ping', argsJson: '{"n":41}'})
  })

  it('rejects with a PageVerbError code no-widget when nothing is connected', async () => {
    await boot()
    if (!state.page) throw new Error('server page caller not captured')
    const failure = await state.page.call('ping', {n: 1}).then(
      () => null,
      (error: unknown) => error,
    )
    expect(isPageVerbError(failure)).toBe(true)
    if (!isPageVerbError(failure)) throw new Error('expected a PageVerbError')
    expect(failure.code).toBe('no-widget')
    expect(failure.extension).toBe('pinger')
    expect(failure.verb).toBe('ping')
  })

  it('maps a browser-reported error code straight through to a PageVerbError', async () => {
    const kit = await boot()
    state.widget = await connectWidget(kit, () => ({error: {code: 'unknown-verb', message: 'nope'}}))
    if (!state.page) throw new Error('server page caller not captured')
    const failure = await state.page.call('ping', {n: 1}).then(
      () => null,
      (error: unknown) => error,
    )
    expect(isPageVerbError(failure)).toBe(true)
    if (!isPageVerbError(failure)) throw new Error('expected a PageVerbError')
    expect(failure.code).toBe('unknown-verb')
  })

  it('maps an unrecognized browser error code to handler-error', async () => {
    const kit = await boot()
    state.widget = await connectWidget(kit, () => ({error: {code: 'weird-thing', message: 'boom'}}))
    if (!state.page) throw new Error('server page caller not captured')
    const failure = await state.page.call('ping', {n: 1}).then(
      () => null,
      (error: unknown) => error,
    )
    expect(isPageVerbError(failure)).toBe(true)
    if (!isPageVerbError(failure)) throw new Error('expected a PageVerbError')
    expect(failure.code).toBe('handler-error')
  })
})
