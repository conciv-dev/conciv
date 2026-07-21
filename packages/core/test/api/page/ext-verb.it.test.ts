import {afterEach, describe, expect, it} from 'vitest'
import {tmpdir} from 'node:os'
import {z} from 'zod'
import {
  defineExtension,
  definePageVerbs,
  isPageVerbError,
  pageVerb,
  type PageCaller,
  type PageVerbError,
} from '@conciv/extension'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'

const pingVerbs = definePageVerbs({
  ping: pageVerb(z.object({n: z.number()}), (args) => ({pong: args.n + 1})),
})

const SeenQuerySchema = z.object({
  kind: z.string(),
  extension: z.string().optional(),
  verb: z.string().optional(),
  argsJson: z.string().optional(),
})

type SeenQuery = z.infer<typeof SeenQuerySchema>
type WidgetReply = Record<string, unknown>
type ReplyFor = (query: SeenQuery) => WidgetReply

function seenQuery(query: unknown): SeenQuery | null {
  const parsed = SeenQuerySchema.safeParse(query)
  return parsed.success ? parsed.data : null
}

async function expectPageVerbError(call: Promise<unknown>): Promise<PageVerbError> {
  const failure = await call.then(
    () => null,
    (error: unknown) => error,
  )
  expect(isPageVerbError(failure)).toBe(true)
  if (!isPageVerbError(failure)) throw new Error('expected a PageVerbError')
  return failure
}

async function connectWidget(kit: Kit, replyFor: ReplyFor): Promise<{seen: SeenQuery[]; end: () => void}> {
  const ctrl = new AbortController()
  const seen: SeenQuery[] = []
  const iterator = await kit.rpc.page.queries(undefined, {signal: ctrl.signal})
  async function pump(): Promise<void> {
    try {
      for await (const {requestId, query} of iterator) {
        const shape = seenQuery(query)
        if (!shape) continue
        seen.push(shape)
        void kit.rpc.page.reply({requestId, data: replyFor(shape)}).catch(() => {})
      }
    } catch {}
  }
  void pump()
  return {seen, end: () => ctrl.abort()}
}

async function connectSilentWidget(kit: Kit): Promise<{end: () => void}> {
  const ctrl = new AbortController()
  const iterator = await kit.rpc.page.queries(undefined, {signal: ctrl.signal})
  async function pump(): Promise<void> {
    try {
      for await (const frame of iterator) {
        void frame
      }
    } catch {}
  }
  void pump()
  return {end: () => ctrl.abort()}
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
    const failure = await expectPageVerbError(state.page.call('ping', {n: 1}))
    expect(failure.code).toBe('no-widget')
    expect(failure.extension).toBe('pinger')
    expect(failure.verb).toBe('ping')
  })

  it('maps a browser-reported error code straight through to a PageVerbError', async () => {
    const kit = await boot()
    state.widget = await connectWidget(kit, () => ({error: {code: 'unknown-verb', message: 'nope'}}))
    if (!state.page) throw new Error('server page caller not captured')
    const failure = await expectPageVerbError(state.page.call('ping', {n: 1}))
    expect(failure.code).toBe('unknown-verb')
  })

  it('maps a browser-reported invalid-args code straight through to a PageVerbError', async () => {
    const kit = await boot()
    state.widget = await connectWidget(kit, () => ({error: {code: 'invalid-args', message: 'bad args'}}))
    if (!state.page) throw new Error('server page caller not captured')
    const failure = await expectPageVerbError(state.page.call('ping', {n: 1}))
    expect(failure.code).toBe('invalid-args')
  })

  it('maps an unrecognized browser error code to handler-error', async () => {
    const kit = await boot()
    state.widget = await connectWidget(kit, () => ({error: {code: 'weird-thing', message: 'boom'}}))
    if (!state.page) throw new Error('server page caller not captured')
    const failure = await expectPageVerbError(state.page.call('ping', {n: 1}))
    expect(failure.code).toBe('handler-error')
  })

  it('maps a connected-but-never-replying widget to a timeout PageVerbError (real bus timeout)', async () => {
    const kit = await boot()
    state.widget = await connectSilentWidget(kit)
    if (!state.page) throw new Error('server page caller not captured')
    const failure = await expectPageVerbError(state.page.call('ping', {n: 1}))
    expect(failure.code).toBe('timeout')
  }, 12_000)
})
