import {defineHarness, type HarnessAdapter, type HarnessCapabilities} from '@aidx/protocol/harness-types'
import type {StreamChunk} from '@tanstack/ai'

// A capability-only stub for a harness whose CLI integration isn't implemented yet. Registered
// so listHarnesses() advertises it and the capability-matrix test guards the contract; both
// buildArgs and decode throw until a real adapter replaces it.
export function defineStubHarness(o: {
  id: string
  binName: string
  capabilities: HarnessCapabilities
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
