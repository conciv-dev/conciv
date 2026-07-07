// /api/page/reply. All page knowledge lives in the driver — swap it to change the

import {makeDomPageDriver, type PageDriver} from './page-driver.js'
import {PageQuerySchema, type PageQuery} from '@conciv/protocol/page-types'
import {definePageBusClient} from '@conciv/api-client'

function parseQuery(raw: string): PageQuery | null {
  try {
    const parsed = PageQuerySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function initPageBus(deps: {apiBase?: string; driver?: PageDriver} = {}): void {
  const bus = definePageBusClient({apiBase: deps.apiBase ?? ''})
  const driver = deps.driver ?? makeDomPageDriver()
  const source = bus.stream()

  source.addEventListener('message', (ev) => {
    const query = parseQuery(ev.data)
    if (!query?.requestId) return
    const requestId = query.requestId
    void (async () => {
      const data = await driver.execute(query)
      void bus.reply({requestId, data}).catch(() => {})
    })()
  })
}
