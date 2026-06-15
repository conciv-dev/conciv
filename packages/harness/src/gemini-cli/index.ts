import {defineStubHarness} from '../_shared/stub.js'

// Capability-only stub pending CLI research; buildArgs/decode throw until implemented.
export const geminiCli = defineStubHarness({
  id: 'gemini-cli',
  binName: 'gemini',
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    imageInput: false,
  },
})
