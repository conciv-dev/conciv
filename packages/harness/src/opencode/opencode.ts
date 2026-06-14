import {defineHarness, type HarnessTurn} from '@aidx/protocol/harness-types'

// Capability-only stub pending CLI research; buildArgs/decode throw until implemented.
export const opencode = defineHarness({
  id: 'opencode',
  binName: 'opencode',
  capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'flag'},
  buildArgs(_turn: HarnessTurn): string[] {
    throw new Error('opencode harness not implemented')
  },
  // eslint-disable-next-line require-yield
  async *decode() {
    throw new Error('opencode harness not implemented')
  },
})
