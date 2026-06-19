import {defineHarness, type HarnessAdapter, type HarnessCapabilities} from '@mandarax/protocol/harness-types'
import type {StreamChunk} from '@tanstack/ai'

// A capability-only harness stub: registered so listHarnesses() advertises it, but buildArgs/
// decode throw until a real adapter replaces it.
export function defineStubHarness(o: {
  id: string
  binName: string
  capabilities: HarnessCapabilities & {transcriptHistory: false; compaction: false}
}): HarnessAdapter {
  const notImplemented = (): never => {
    throw new Error(`${o.id} harness not implemented`)
  }
  return defineHarness({
    ...o,
    buildArgs: notImplemented,
    // eslint-disable-next-line require-yield
    async *decode(): AsyncGenerator<StreamChunk> {
      notImplemented()
    },
  })
}
