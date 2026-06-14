import {defineStubHarness} from '../_shared/stub.js'

// Capability-only stub pending CLI research; buildArgs/decode throw until implemented.
export const opencode = defineStubHarness({
  id: 'opencode',
  binName: 'opencode',
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: false,
    systemPrompt: 'flag',
    mcp: 'none',
    imageInput: false,
  },
})
