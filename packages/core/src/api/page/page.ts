import {type H3, type H3Event, getValidatedQuery, getValidatedRouterParams, readValidatedBody} from 'h3'
import {z} from 'zod'
import {
  isMutating,
  PageQueryInputSchema,
  PageQueryKindSchema,
  type PageQuery,
  type PageQueryInput,
} from '@devgent/protocol/page-protocol'
import type {Journal} from '../../page/journal.js'
import {corsHeadersFor} from '../cors.js'

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
}

const PageReplySchema = z.object({requestId: z.string(), data: z.record(z.string(), z.unknown()).default({})})
const VerbParamsSchema = z.object({verb: PageQueryKindSchema})

function pageArgs(input: PageQueryInput): Record<string, unknown> {
  const {ref: _ref, selector: _selector, since: _since, ...rest} = input
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
}

type PageBus = {
  ask: (query: Omit<PageQuery, 'requestId'>) => Promise<Record<string, unknown>>
  resolve: (requestId: string, data: Record<string, unknown>) => void
  subscribe: (controller: ReadableStreamDefaultController<Uint8Array>) => () => void
}

// Deliver a query to the widget over the SSE stream and resolve when it POSTs the answer.
function makePageBus(timeoutMs = 5000): PageBus {
  const pending = new Map<string, (data: Record<string, unknown>) => void>()
  const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const encoder = new TextEncoder()
  const idState = {n: 0}

  function resolve(requestId: string, data: Record<string, unknown>): void {
    const fn = pending.get(requestId)
    if (!fn) return
    pending.delete(requestId)
    fn(data)
  }

  function subscribe(controller: ReadableStreamDefaultController<Uint8Array>): () => void {
    subscribers.add(controller)
    return () => subscribers.delete(controller)
  }

  function ask(query: Omit<PageQuery, 'requestId'>): Promise<Record<string, unknown>> {
    idState.n += 1
    const requestId = `pq${idState.n}`
    const ms = typeof query.timeout === 'number' ? query.timeout + 1000 : timeoutMs
    return new Promise((res) => {
      if (subscribers.size === 0) {
        res({error: 'no widget connected'})
        return
      }
      const timer = setTimeout(() => {
        pending.delete(requestId)
        res({error: 'page did not reply (no widget connected?)'})
      }, ms)
      pending.set(requestId, (d) => {
        clearTimeout(timer)
        res(d)
      })
      const frame = encoder.encode(`data: ${JSON.stringify({requestId, ...query})}\n\n`)
      for (const c of subscribers) c.enqueue(frame)
    })
  }

  return {ask, resolve, subscribe}
}

export function registerPageRoutes(app: H3, deps: {journal: Journal}): void {
  const bus = makePageBus()

  app.get('/api/page/stream', (event) => {
    const encoder = new TextEncoder()
    let unsubscribe = () => {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': page-bus open\n\n'))
        unsubscribe = bus.subscribe(controller)
      },
      cancel() {
        unsubscribe()
      },
    })
    return new Response(stream, {status: 200, headers: {...SSE_HEADERS, ...corsHeadersFor(event)}})
  })

  app.post('/api/page/reply', async (event) => {
    const {requestId, data} = await readValidatedBody(event, PageReplySchema)
    bus.resolve(requestId, data)
    return {ok: true}
  })

  app.get('/api/page/changes', () => deps.journal.list())
  app.post('/api/page/changes/clear', () => {
    deps.journal.clear()
    return {cleared: true}
  })

  async function handleVerb(event: H3Event): Promise<Record<string, unknown>> {
    const {verb} = await getValidatedRouterParams(event, VerbParamsSchema)
    const input =
      event.req.method === 'POST'
        ? await readValidatedBody(event, PageQueryInputSchema)
        : await getValidatedQuery(event, PageQueryInputSchema)
    const data = await bus.ask({kind: verb, ...input})
    if (isMutating(verb) && typeof data.error !== 'string') {
      deps.journal.append({verb, ref: input.ref, selector: input.selector, args: pageArgs(input)}, Date.now())
    }
    return data
  }

  app.get('/api/page/:verb', handleVerb)
  app.post('/api/page/:verb', handleVerb)
}
