import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {tmpdir} from 'node:os'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {chunkWithInlineMap, cleanupChunks} from '../../page/fixtures.js'

const ErrorSchema = z.object({message: z.string()})
const ChangesSchema = z.array(
  z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
)

async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  kit: Kit,
  answerFor: (kind: string) => unknown,
): Promise<void> {
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice('data:'.length).trim()
        if (!payload) continue
        const query: {requestId?: string; kind?: string} = JSON.parse(payload)
        if (!query.requestId) continue
        void kit.post('/api/page/reply', {requestId: query.requestId, data: answerFor(query.kind ?? '')})
      }
    }
  } catch {}
}

async function connectWidget(kit: Kit, answerFor: (kind: string) => unknown): Promise<{end: () => void}> {
  const ctrl = new AbortController()
  const res = await fetch(`${kit.base}/api/page/stream`, {signal: ctrl.signal})
  const body = res.body
  if (!body) throw new Error('page-stream had no body')
  void pumpStream(body.getReader(), kit, answerFor)
  return {end: () => ctrl.abort()}
}

describe('page routes page-bus (IT, real server)', () => {
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

  const getJson = async (kit: Kit, path: string): Promise<unknown> => (await kit.get(path)).json()
  const postJson = async (kit: Kit, path: string, body: unknown): Promise<unknown> =>
    (await kit.post(path, body)).json()

  it('enriches a locate reply with symbolicated source', async () => {
    const kit = await setup()
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    state.widget = await connectWidget(kit, () => ({
      component: 'Home',
      stack: ['Home'],
      frames: [{fileName: `file://${chunk}`, line: 2, column: 1}],
    }))
    const data = (await getJson(kit, '/api/page/locate?selector=h1')) as Record<string, unknown>
    expect(data.component).toBe('Home')
    expect(data.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
  })

  it('round-trips a page query: SSE push → widget reply → the query resolves', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, () => ({pathname: '/checkout', search: ''}))
    expect(await getJson(kit, '/api/page/route')).toEqual({pathname: '/checkout', search: ''})
  })

  it('returns 503 when no widget is subscribed', async () => {
    const kit = await setup()
    const res = await kit.get('/api/page/route')
    expect(res.status).toBe(503)
    const body = ErrorSchema.parse(await res.json())
    expect(body.message).toContain('no widget')
  })

  it('round-trips a fill action and the journal records it', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, () => ({ok: true}))
    expect(await postJson(kit, '/api/page/fill', {selector: '#email', value: 'a@b.c'})).toEqual({ok: true})
    const changes = ChangesSchema.parse(await getJson(kit, '/api/page/changes'))
    expect(changes).toMatchObject([{verb: 'fill', selector: '#email', args: {value: 'a@b.c'}}])
  })

  it('does NOT journal a read, and clear empties the journal', async () => {
    const kit = await setup()
    state.widget = await connectWidget(kit, () => ({text: 'hi'}))
    await getJson(kit, '/api/page/text?selector=%23h')
    await postJson(kit, '/api/page/click', {selector: '.btn'})
    expect(ChangesSchema.parse(await getJson(kit, '/api/page/changes'))).toHaveLength(1)
    await postJson(kit, '/api/page/changes/clear', {})
    expect(ChangesSchema.parse(await getJson(kit, '/api/page/changes'))).toEqual([])
  })
})
