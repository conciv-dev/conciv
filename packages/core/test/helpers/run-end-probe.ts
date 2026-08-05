import {defineExtension, type AnyExtension} from '@conciv/extension'

export function makeRunEndProbe(): {probe: AnyExtension; runEnded: Promise<string>} {
  const runEnd = {resolve: (_sessionId: string) => {}}
  const runEnded = new Promise<string>((resolve) => (runEnd.resolve = resolve))
  const probe = defineExtension({name: 'run-end-probe'}).server(() => ({
    context: {},
    turnEnd: (sessionId: string) => runEnd.resolve(sessionId),
  }))
  return {probe, runEnded}
}
