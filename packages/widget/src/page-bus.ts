// Widget side of the page-bus: pure SSE transport. The dev server pushes PageQuery events
// over /api/page/stream; we hand each to the PageDriver and POST the result back to
// /api/page/reply. All page knowledge lives in the driver — swap it to change the
// execution backend without touching transport.
import {makeDomPageDriver, type PageDriver} from './page-driver.js'
import {PageQuerySchema, PageReplySchema, type PageQuery} from '@mandarax/protocol/page-types'
import {OkSchema} from '@mandarax/protocol/chat-types'
import {createTransport} from '@mandarax/session-client'

function parseQuery(raw: string): PageQuery | null {
  try {
    const parsed = PageQuerySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function initPageBus(deps: {apiBase?: string; driver?: PageDriver} = {}): void {
  const t = createTransport({apiBase: deps.apiBase ?? ''})
  const driver = deps.driver ?? makeDomPageDriver()
  const reply = t.route({method: 'POST', path: '/api/page/reply', request: PageReplySchema, response: OkSchema})
  const source = t.eventSource('/api/page/stream')

  source.addEventListener('message', (ev) => {
    const query = parseQuery(ev.data)
    if (!query?.requestId) return
    const requestId = query.requestId
    void (async () => {
      const data = await driver.execute(query)
      void reply({requestId, data}).catch(() => {})
    })()
  })
}
