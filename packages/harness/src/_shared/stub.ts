import {defineHarness, type HarnessAdapter, type HarnessCapabilities} from '@conciv/protocol/harness-types'
import type {StreamChunk} from '@tanstack/ai'

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
