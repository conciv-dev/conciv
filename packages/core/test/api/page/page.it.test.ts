import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {tmpdir} from 'node:os'
import type {PageReportedErrorCode} from '@conciv/protocol/page-types'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {connectWidget} from '../../helpers/fake-widget.js'
import {chunkWithInlineMap, cleanupChunks} from '../../editor/fixtures.js'

const ChangesSchema = z.array(
  z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
)

const LocateSchema = z.looseObject({
  component: z.string().optional(),
  source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
})

function callPage(kit: Kit, name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  return kit.rpc.registry.call({name, input})
}

describe('registry.call page-bus (IT, real server, typed rpc)', () => {
  const state = {kit: undefined as Kit | undefined, widget: undefined as {end: () => void} | undefined}
  afterEach(async () => {
    state.widget?.end()
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    state.widget = undefined
    await cleanupChunks()
  })

  async function setup(): Promise<Kit> {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    return kit
  }

  it('enriches a locate reply with symbolicated source through the server-wrapped locate tool', async () => {
    const kit = await setup()
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    state.widget = await connectWidget(kit, '', () => ({
      ok: true,
      result: {component: 'Home', stack: ['Home'], frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]},
    }))
    const data = LocateSchema.parse(await callPage(kit, 'page.locate', {selector: 'h1'}))
    expect(data.component).toBe('Home')
    expect(data.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
  })

  it('round-trips a page query: SSE push → widget reply → the query resolves', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, '', () => ({
      ok: true,
      result: {pathname: '/checkout', search: '', href: 'x'},
    }))
    expect(await callPage(kit, 'page.route')).toEqual({pathname: '/checkout', search: '', href: 'x'})
  })

  it('reports NO_PAGE_CLIENT when no widget is subscribed', async () => {
    const kit = await setup()
    await expect(callPage(kit, 'page.route')).rejects.toMatchObject({
      code: 'NO_PAGE_CLIENT',
    })
  })

  it('rejects a name no tool answers to as UNKNOWN_TOOL without touching the bus', async () => {
    const kit = await setup()
    await expect(callPage(kit, 'page.nothing')).rejects.toMatchObject({code: 'UNKNOWN_TOOL'})
  })

  it('round-trips a fill action and the journal records it', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, '', () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
    expect(await callPage(kit, 'page.fill', {selector: '#email', value: 'a@b.c'})).toEqual({ok: true, value: 'a@b.c'})
    const changes = ChangesSchema.parse(await kit.rpc.page.changes(undefined))
    expect(changes).toMatchObject([{verb: 'page.fill', selector: '#email', args: {value: 'a@b.c'}}])
  })

  const FAILURE_CODES: [PageReportedErrorCode, string][] = [
    ['invalid-args', 'INVALID_ARGS'],
    ['unknown-verb', 'UNKNOWN_TOOL'],
    ['handler-error', 'HANDLER_ERROR'],
  ]

  it.each(FAILURE_CODES)('turns the browser failure %s into the declared rpc error %s', async (code, rpcCode) => {
    const kit = await setup()
    state.widget = await connectWidget(kit, '', () => ({ok: false, error: {code, message: `${code} says no`}}))
    await expect(callPage(kit, 'page.text', {selector: '#h'})).rejects.toMatchObject({
      code: rpcCode,
      message: `page.text: ${code} says no`,
    })
  })

  it('does not journal a mutation the page refused', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, '', () => ({
      ok: false,
      error: {code: 'invalid-args', message: 'no element for selector #email'},
    }))
    await expect(callPage(kit, 'page.fill', {selector: '#email', value: 'a@b.c'})).rejects.toMatchObject({
      code: 'INVALID_ARGS',
    })
    expect(ChangesSchema.parse(await kit.rpc.page.changes(undefined))).toEqual([])
  })

  it('does NOT journal a read, and clear empties the journal', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, '', (name) =>
      name === 'page.text' ? {ok: true, result: {text: 'hi'}} : {ok: true, result: {ok: true}},
    )
    await callPage(kit, 'page.text', {selector: '#h'})
    await callPage(kit, 'page.click', {selector: '.btn'})
    expect(ChangesSchema.parse(await kit.rpc.page.changes(undefined))).toHaveLength(1)
    await kit.rpc.page.clearChanges(undefined)
    expect(ChangesSchema.parse(await kit.rpc.page.changes(undefined))).toEqual([])
  })
})
