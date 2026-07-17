import {z} from 'zod'
import type {ActionLogEntry, RrwebEvent} from '../shared/protocol.js'
import {createNodeIndex} from './node-index.js'

const meta = z.object({href: z.string()})
const fullSnapshot = z.object({node: z.unknown()})
const incremental = z.looseObject({source: z.number()})
const click = z.looseObject({source: z.literal(2), type: z.literal(2), id: z.number()})
const input = z.looseObject({source: z.literal(5), id: z.number(), text: z.string()})
const scroll = z.looseObject({source: z.literal(3), id: z.number()})
const consoleEvent = z.object({
  plugin: z.literal('rrweb/console@1'),
  payload: z.looseObject({level: z.string(), payload: z.array(z.string())}),
})

const SCROLL_COALESCE_MS = 1500
const RELOAD_META_GAP_MS = 2000

export function distill(events: RrwebEvent[]): ActionLogEntry[] {
  const index = createNodeIndex()
  const log: ActionLogEntry[] = []
  let snapshots = 0
  let lastMetaTs = Number.NEGATIVE_INFINITY

  const push = (entry: ActionLogEntry): void => {
    const last = log.at(-1)
    const coalesce =
      entry.kind === 'scroll' &&
      last?.kind === 'scroll' &&
      last.detail === entry.detail &&
      entry.ts - last.ts < SCROLL_COALESCE_MS
    if (coalesce) {
      last.ts = entry.ts
      return
    }
    log.push(entry)
  }

  for (const event of events) {
    if (event.type === 4) {
      const parsed = meta.safeParse(event.data)
      lastMetaTs = event.timestamp
      if (parsed.success) push({ts: event.timestamp, kind: 'navigation', detail: parsed.data.href})
    }
    if (event.type === 2) {
      const parsed = fullSnapshot.safeParse(event.data)
      if (parsed.success) index.applyFullSnapshot(parsed.data.node)
      snapshots += 1
      const followsMeta = event.timestamp - lastMetaTs < RELOAD_META_GAP_MS
      if (snapshots > 1 && followsMeta)
        push({ts: event.timestamp, kind: 'reload', detail: 'page reloaded (new snapshot)'})
    }
    if (event.type === 3) {
      const base = incremental.safeParse(event.data)
      if (!base.success) continue
      if (base.data.source === 0) index.applyMutation(event.data)
      const clicked = click.safeParse(event.data)
      if (clicked.success)
        push({ts: event.timestamp, kind: 'click', detail: `clicked ${index.describe(clicked.data.id)}`})
      const typed = input.safeParse(event.data)
      if (typed.success)
        push({
          ts: event.timestamp,
          kind: 'input',
          detail: `typed "${typed.data.text}" into ${index.describe(typed.data.id)}`,
        })
      const scrolled = scroll.safeParse(event.data)
      if (scrolled.success)
        push({ts: event.timestamp, kind: 'scroll', detail: `scrolled ${index.describe(scrolled.data.id)}`})
    }
    if (event.type === 6) {
      const parsed = consoleEvent.safeParse(event.data)
      if (parsed.success && parsed.data.payload.level === 'error')
        push({
          ts: event.timestamp,
          kind: 'console',
          detail: `console.error ${parsed.data.payload.payload.join(' ').slice(0, 200)}`,
        })
    }
  }
  return log
}
