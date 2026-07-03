import {defineStubHarness} from '../_shared/stub.js'

export const opencode = defineStubHarness({
  id: 'opencode',
  binName: 'opencode',
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
})
