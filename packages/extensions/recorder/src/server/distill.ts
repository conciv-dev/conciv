import {z} from 'zod'
import type {ActionLogEntry, RrwebEvent} from '../shared/protocol.js'
import {createNodeIndex, type NodeIndex} from './node-index.js'

const meta = z.object({href: z.string()})
const fullSnapshot = z.object({node: z.unknown()})
const mutation = z.looseObject({source: z.literal(0)})
const click = z.looseObject({source: z.literal(2), type: z.literal(2), id: z.number()})
const input = z.looseObject({source: z.literal(5), id: z.number(), text: z.string()})
const scroll = z.looseObject({source: z.literal(3), id: z.number()})
const consoleError = z.object({
  plugin: z.literal('rrweb/console@1'),
  payload: z.looseObject({level: z.literal('error'), payload: z.array(z.string())}),
})

const SCROLL_COALESCE_MS = 1500
const RELOAD_META_GAP_MS = 2000

type DistillState = {index: NodeIndex; snapshots: number; lastMetaTs: number}

function navigationEntry(state: DistillState, event: RrwebEvent): ActionLogEntry | undefined {
  state.lastMetaTs = event.timestamp
  const parsed = meta.safeParse(event.data)
  if (!parsed.success) return undefined
  return {ts: event.timestamp, kind: 'navigation', detail: parsed.data.href}
}

function snapshotEntry(state: DistillState, event: RrwebEvent): ActionLogEntry | undefined {
  const parsed = fullSnapshot.safeParse(event.data)
  if (parsed.success) state.index.applyFullSnapshot(parsed.data.node)
  state.snapshots += 1
  const isReload = state.snapshots > 1 && event.timestamp - state.lastMetaTs < RELOAD_META_GAP_MS
  if (!isReload) return undefined
  return {ts: event.timestamp, kind: 'reload', detail: 'page reloaded (new snapshot)'}
}

function incrementalEntry(state: DistillState, event: RrwebEvent): ActionLogEntry | undefined {
  if (mutation.safeParse(event.data).success) state.index.applyMutation(event.data)
  const ts = event.timestamp
  const clicked = click.safeParse(event.data)
  if (clicked.success) {
    if (clicked.data.id === -1) return undefined
    return {ts, kind: 'click', detail: `clicked ${state.index.describe(clicked.data.id)}`}
  }
  const typed = input.safeParse(event.data)
  if (typed.success) {
    if (typed.data.id === -1 || typed.data.text === '') return undefined
    return {ts, kind: 'input', detail: `typed "${typed.data.text}" into ${state.index.describe(typed.data.id)}`}
  }
  const scrolled = scroll.safeParse(event.data)
  if (scrolled.success) {
    if (scrolled.data.id === -1) return undefined
    return {ts, kind: 'scroll', detail: `scrolled ${state.index.describe(scrolled.data.id)}`}
  }
  return undefined
}

function consoleEntry(event: RrwebEvent): ActionLogEntry | undefined {
  const parsed = consoleError.safeParse(event.data)
  if (!parsed.success) return undefined
  return {
    ts: event.timestamp,
    kind: 'console',
    detail: `console.error ${parsed.data.payload.payload.join(' ').slice(0, 200)}`,
  }
}

function entryFor(state: DistillState, event: RrwebEvent): ActionLogEntry | undefined {
  if (event.type === 4) return navigationEntry(state, event)
  if (event.type === 2) return snapshotEntry(state, event)
  if (event.type === 3) return incrementalEntry(state, event)
  if (event.type === 6) return consoleEntry(event)
  return undefined
}

function coalescesInto(last: ActionLogEntry | undefined, entry: ActionLogEntry): last is ActionLogEntry {
  return (
    entry.kind === 'scroll' &&
    last?.kind === 'scroll' &&
    last.detail === entry.detail &&
    entry.ts - last.ts < SCROLL_COALESCE_MS
  )
}

export function distill(events: RrwebEvent[]): ActionLogEntry[] {
  const state: DistillState = {index: createNodeIndex(), snapshots: 0, lastMetaTs: Number.NEGATIVE_INFINITY}
  const log: ActionLogEntry[] = []
  for (const event of events) {
    const entry = entryFor(state, event)
    if (!entry) continue
    const last = log.at(-1)
    if (coalescesInto(last, entry)) {
      last.ts = entry.ts
      continue
    }
    log.push(entry)
  }
  return log
}
