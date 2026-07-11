import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {tmpdir} from 'node:os'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {chunkWithInlineMap, cleanupChunks} from '../../page/fixtures.js'

const ChangesSchema = z.array(
  z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
)

async function connectWidget(
  kit: Kit,
  answerFor: (kind: string) => Record<string, unknown>,
): Promise<{end: () => void}> {
  const ctrl = new AbortController()
  const iterator = await kit.rpc.page.queries(undefined, {signal: ctrl.signal})
  void (async () => {
    try {
      for await (const {requestId, query} of iterator) {
        const kind =
          typeof query === 'object' && query !== null && 'kind' in query && typeof query.kind === 'string'
            ? query.kind
            : ''
        void kit.rpc.page.reply({requestId, data: answerFor(kind)}).catch(() => {})
      }
    } catch {}
  })()
  return {end: () => ctrl.abort()}
}

describe('page.run page-bus (IT, real server, typed rpc)', () => {
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

  it('enriches a locate reply with symbolicated source', async () => {
    const kit = await setup()
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    state.widget = await connectWidget(kit, () => ({
      component: 'Home',
      stack: ['Home'],
      frames: [{fileName: `file://${chunk}`, line: 2, column: 1}],
    }))
    const data = await kit.rpc.page.run({verb: 'locate', selector: 'h1'})
    expect(data.component).toBe('Home')
    expect(data.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
  })

  it('round-trips a page query: SSE push → widget reply → the query resolves', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, () => ({pathname: '/checkout', search: ''}))
    expect(await kit.rpc.page.run({verb: 'route'})).toEqual({pathname: '/checkout', search: ''})
  })

  it('reports NO_PAGE_CLIENT when no widget is subscribed', async () => {
    const kit = await setup()
    await expect(kit.rpc.page.run({verb: 'route'})).rejects.toMatchObject({
      code: 'NO_PAGE_CLIENT',
      message: 'no widget connected',
    })
  })

  it('round-trips a fill action and the journal records it', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, () => ({ok: true}))
    expect(await kit.rpc.page.run({verb: 'fill', selector: '#email', value: 'a@b.c'})).toEqual({ok: true})
    const changes = ChangesSchema.parse(await kit.rpc.page.changes(undefined))
    expect(changes).toMatchObject([{verb: 'fill', selector: '#email', args: {value: 'a@b.c'}}])
  })

  it('does NOT journal a read, and clear empties the journal', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, () => ({text: 'hi'}))
    await kit.rpc.page.run({verb: 'text', selector: '#h'})
    await kit.rpc.page.run({verb: 'click', selector: '.btn'})
    expect(ChangesSchema.parse(await kit.rpc.page.changes(undefined))).toHaveLength(1)
    await kit.rpc.page.clearChanges(undefined)
    expect(ChangesSchema.parse(await kit.rpc.page.changes(undefined))).toEqual([])
  })
})
