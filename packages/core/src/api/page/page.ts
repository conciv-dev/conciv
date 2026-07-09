import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {zValidator} from '@hono/zod-validator'
import {z} from 'zod'
import {
  isMutating,
  PageQueryInputSchema,
  PageQueryKindSchema,
  type PageQuery,
  type PageQueryInput,
} from '@conciv/protocol/page-types'
import type {Journal} from '../../runtime/journal.js'
import {makePending} from '../../pending.js'
import {symbolicateFrames, type RawFrame} from '../../page/symbolicate.js'

export type PageBus = {
  ask: (query: Omit<PageQuery, 'requestId'>) => Promise<Record<string, unknown>>
  resolve: (requestId: string, data: Record<string, unknown>) => boolean
  subscribe: (emit: (frame: unknown) => void) => () => void
}

export type PageVars = {page: {journal: Journal; root: string; bus: PageBus}}

export function makePageBus(timeoutMs = 5000): PageBus {
  const pending = makePending<Record<string, unknown>>()
  const subscribers = new Set<(frame: unknown) => void>()
  const idState = {n: 0}

  function subscribe(emit: (frame: unknown) => void): () => void {
    subscribers.add(emit)
    return () => subscribers.delete(emit)
  }

  async function ask(query: Omit<PageQuery, 'requestId'>): Promise<Record<string, unknown>> {
    if (subscribers.size === 0) throw new HTTPException(503, {message: 'no widget connected'})
    idState.n += 1
    const requestId = `pq${idState.n}`
    const ms = typeof query.timeout === 'number' ? query.timeout + 1000 : timeoutMs
    for (const emit of subscribers) emit({requestId, ...query})
    try {
      return await pending.await(requestId, ms)
    } catch {
      throw new HTTPException(504, {message: 'page did not reply (no widget connected?)'})
    }
  }

  return {ask, resolve: pending.resolve, subscribe}
}

function frameRequestId(frame: unknown): string | null {
  if (typeof frame !== 'object' || frame === null) return null
  if (!('requestId' in frame) || typeof frame.requestId !== 'string') return null
  return frame.requestId
}

export async function* pageQueryStream(
  bus: PageBus,
  signal: AbortSignal,
): AsyncGenerator<{requestId: string; query: unknown}> {
  const queue: unknown[] = []
  const waiter = {wake: () => {}}
  const unsubscribe = bus.subscribe((frame) => {
    queue.push(frame)
    waiter.wake()
  })
  const onAbort = () => waiter.wake()
  signal.addEventListener('abort', onAbort, {once: true})
  try {
    while (!signal.aborted) {
      const frame = queue.shift()
      if (frame !== undefined) {
        const requestId = frameRequestId(frame)
        if (requestId !== null) yield {requestId, query: frame}
        continue
      }
      await new Promise<void>((resolve) => {
        waiter.wake = resolve
        if (queue.length > 0 || signal.aborted) resolve()
      })
      waiter.wake = () => {}
    }
  } finally {
    unsubscribe()
    signal.removeEventListener('abort', onAbort)
  }
}

function pageArgs(input: PageQueryInput): Record<string, unknown> {
  const {ref: _ref, selector: _selector, since: _since, ...rest} = input
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

const VerbParamsSchema = z.object({verb: PageQueryKindSchema})

async function runVerb(
  env: PageVars['page'],
  input: PageQueryInput,
  verb: PageQuery['kind'],
): Promise<Record<string, unknown>> {
  const data = await env.bus.ask({kind: verb, ...input})
  if (isMutating(verb)) {
    env.journal.append({verb, ref: input.ref, selector: input.selector, args: pageArgs(input)}, Date.now())
  }
  if (verb === 'locate' && !data.source && Array.isArray(data.frames)) {
    return {...data, source: await symbolicateFrames(data.frames as RawFrame[], env.root)}
  }
  return data
}

const app = new Hono<{Variables: PageVars}>()
  .get('/changes', (c) => c.json(c.var.page.journal.list()))
  .post('/changes/clear', (c) => {
    c.var.page.journal.clear()
    return c.json({ok: true})
  })
  .get('/:verb', zValidator('param', VerbParamsSchema), zValidator('query', PageQueryInputSchema), async (c) =>
    c.json(await runVerb(c.var.page, c.req.valid('query'), c.req.valid('param').verb)),
  )
  .post('/:verb', zValidator('param', VerbParamsSchema), zValidator('json', PageQueryInputSchema), async (c) =>
    c.json(await runVerb(c.var.page, c.req.valid('json'), c.req.valid('param').verb)),
  )

export default app
