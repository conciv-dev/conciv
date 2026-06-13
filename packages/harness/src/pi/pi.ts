import {defineHarness, type HarnessTurn} from '@devgent/protocol/harness-types'

// Capability-only stub pending CLI research; buildArgs/decode throw until implemented.
export const pi = defineHarness({
  id: 'pi',
  binName: 'pi',
  capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'flag'},
  buildArgs(_turn: HarnessTurn): string[] {
    throw new Error('pi harness not implemented')
  },
  // eslint-disable-next-line require-yield
  async *decode() {
    throw new Error('pi harness not implemented')
  },
})
