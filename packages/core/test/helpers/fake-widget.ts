import type {PageOutcome} from '@conciv/protocol/page-types'
import {withDeadline, type Kit} from '@conciv/harness-testkit'

export type FakeWidget = {end: () => void; seen: () => string[]}

const CONNECT_DEADLINE_MS = 10_000

export async function connectWidget(kit: Kit, answerFor: (name: string) => PageOutcome): Promise<FakeWidget> {
  const ctrl = new AbortController()
  const seen: string[] = []
  const iterator = await withDeadline(
    CONNECT_DEADLINE_MS,
    `opening the page query stream exceeded ${CONNECT_DEADLINE_MS}ms; the widget never attached`,
    () => kit.rpc.page.queries(undefined, {signal: ctrl.signal}),
  )
  void (async () => {
    try {
      for await (const {requestId, query} of iterator) {
        const name =
          typeof query === 'object' && query !== null && 'name' in query && typeof query.name === 'string'
            ? query.name
            : ''
        seen.push(name)
        void kit.rpc.page.reply({requestId, outcome: answerFor(name)}).catch(() => {})
      }
    } catch {}
  })()
  return {end: () => ctrl.abort(), seen: () => [...seen]}
}
