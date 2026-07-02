import {type H3, type H3Event, HTTPError, getValidatedQuery, getValidatedRouterParams, readValidatedBody} from 'h3'
import {z} from 'zod'
import {
  isMutating,
  PageQueryInputSchema,
  PageQueryKindSchema,
  PageReplySchema,
  type PageQuery,
  type PageQueryInput,
} from '@conciv/protocol/page-types'
import type {Journal} from '../../runtime/journal.js'
import {makePending} from '../../pending.js'
import {sseStream} from '../sse.js'
import {symbolicateFrames, type RawFrame} from '../../page/symbolicate.js'

export function registerPageRoutes(app: H3, deps: {journal: Journal; root: string}): {ask: PageBus['ask']} {
  const bus = makePageBus()

  app.get('/api/page/stream', (event) => sseStream(event, 'page-bus open', (emit) => bus.subscribe(emit)))

  app.post('/api/page/reply', async (event) => {
    const {requestId, data} = await readValidatedBody(event, PageReplySchema)
    bus.resolve(requestId, data)
    return {ok: true}
  })

  app.get('/api/page/changes', () => deps.journal.list())
  app.post('/api/page/changes/clear', () => {
    deps.journal.clear()
    return {ok: true}
  })

  async function handleVerb(event: H3Event): Promise<Record<string, unknown>> {
    const {verb} = await getValidatedRouterParams(event, VerbParamsSchema)
    const input =
      event.req.method === 'POST'
        ? await readValidatedBody(event, PageQueryInputSchema)
        : await getValidatedQuery(event, PageQueryInputSchema)
    const data = await bus.ask({kind: verb, ...input})
    if (isMutating(verb)) {
      deps.journal.append({verb, ref: input.ref, selector: input.selector, args: pageArgs(input)}, Date.now())
    }

    if (verb === 'locate' && !data.source && Array.isArray(data.frames)) {
      return {...data, source: await symbolicateFrames(data.frames as RawFrame[], deps.root)}
    }
    return data
  }

  app.get('/api/page/:verb', handleVerb)
  app.post('/api/page/:verb', handleVerb)

  return {ask: bus.ask}
}

type PageBus = {
  ask: (query: Omit<PageQuery, 'requestId'>) => Promise<Record<string, unknown>>
  resolve: (requestId: string, data: Record<string, unknown>) => void
  subscribe: (emit: (frame: unknown) => void) => () => void
}

function makePageBus(timeoutMs = 5000): PageBus {
  const pending = makePending<Record<string, unknown>>()
  const subscribers = new Set<(frame: unknown) => void>()
  const idState = {n: 0}

  function subscribe(emit: (frame: unknown) => void): () => void {
    subscribers.add(emit)
    return () => subscribers.delete(emit)
  }

  async function ask(query: Omit<PageQuery, 'requestId'>): Promise<Record<string, unknown>> {
    if (subscribers.size === 0) throw new HTTPError({status: 503, message: 'no widget connected'})
    idState.n += 1
    const requestId = `pq${idState.n}`
    const ms = typeof query.timeout === 'number' ? query.timeout + 1000 : timeoutMs
    for (const emit of subscribers) emit({requestId, ...query})
    try {
      return await pending.await(requestId, ms)
    } catch {
      throw new HTTPError({status: 504, message: 'page did not reply (no widget connected?)'})
    }
  }

  return {ask, resolve: pending.resolve, subscribe}
}

function pageArgs(input: PageQueryInput): Record<string, unknown> {
  const {ref: _ref, selector: _selector, since: _since, ...rest} = input
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

const VerbParamsSchema = z.object({verb: PageQueryKindSchema})
