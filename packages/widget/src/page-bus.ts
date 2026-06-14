// Widget side of the page-bus: pure SSE transport. The dev server pushes PageQuery events
// over /api/page/stream; we hand each to the PageDriver and POST the result back to
// /api/page/reply. All page knowledge lives in the driver — swap it to change the
// execution backend without touching transport.
import {makeDomPageDriver, type PageDriver} from './page-driver.js'
import {PageQuerySchema, type PageQuery} from '@aidx/protocol/page-types'

function parseQuery(raw: string): PageQuery | null {
  try {
    const parsed = PageQuerySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function initPageBus(deps: {apiBase?: string; driver?: PageDriver} = {}): void {
  const base = (deps.apiBase ?? '').replace(/\/+$/, '')
  const driver = deps.driver ?? makeDomPageDriver()
  const source = new EventSource(`${base}/api/page/stream`, {withCredentials: true})

  source.addEventListener('message', (ev) => {
    const query = parseQuery(ev.data)
    if (!query?.requestId) return
    void (async () => {
      const data = await driver.execute(query)
      void fetch(`${base}/api/page/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({requestId: query.requestId, data}),
      })
    })()
  })
}
