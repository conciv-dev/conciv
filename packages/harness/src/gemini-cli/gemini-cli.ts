import {defineHarness, type HarnessTurn} from '@aidx/protocol/harness-types'

// Capability-only stub pending CLI research; buildArgs/decode throw until implemented. Registered
// so listHarnesses() advertises it and the capability-matrix test guards the contract.
export const geminiCli = defineHarness({
  id: 'gemini-cli',
  binName: 'gemini',
  capabilities: {resume: false, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'flag'},
  buildArgs(_turn: HarnessTurn): string[] {
    throw new Error('gemini-cli harness not implemented')
  },
  // eslint-disable-next-line require-yield
  async *decode() {
    throw new Error('gemini-cli harness not implemented')
  },
})
