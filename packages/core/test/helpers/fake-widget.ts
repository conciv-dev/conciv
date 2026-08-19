import type {PageOutcome} from '@conciv/protocol/page-types'
import type {Kit} from '@conciv/harness-testkit'

export type FakeWidget = {end: () => void; seen: () => string[]}

export async function connectWidget(
  kit: Kit,
  sessionId: string,
  answerFor: (name: string) => PageOutcome,
): Promise<FakeWidget> {
  const ctrl = new AbortController()
  const seen: string[] = []
  const iterator = await kit.rpc.page.queries({sessionId}, {signal: ctrl.signal})
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
