import {z} from 'zod'
import type {RrwebEvent} from '../shared/protocol.js'

export type IdleSpan = {startMs: number; endMs: number}

const INTERACTION_SOURCES: ReadonlySet<number> = new Set([1, 2, 3, 5])

const incrementalSource = z.looseObject({source: z.number()})

function isInteraction(event: RrwebEvent): boolean {
  if (event.type === 4 || event.type === 6) return true
  if (event.type !== 3) return false
  const parsed = incrementalSource.safeParse(event.data)
  return parsed.success && INTERACTION_SOURCES.has(parsed.data.source)
}

export function computeIdleSpans(events: RrwebEvent[], thresholdMs = 10_000, paddingMs = 1000): IdleSpan[] {
  const first = events[0]
  const last = events.at(-1)
  if (!first || !last) return []
  const base = first.timestamp
  const marks = [base, ...events.filter(isInteraction).map((event) => event.timestamp), last.timestamp]
  return marks
    .slice(1)
    .map((next, index): IdleSpan => ({startMs: (marks[index] ?? base) - base, endMs: next - base}))
    .filter((span) => span.endMs - span.startMs > thresholdMs)
    .map((span) => ({startMs: span.startMs + paddingMs, endMs: span.endMs - paddingMs}))
}

export function idleSpanAt(spans: IdleSpan[], timeMs: number): IdleSpan | undefined {
  return spans.find((span) => timeMs >= span.startMs && timeMs < span.endMs)
}
