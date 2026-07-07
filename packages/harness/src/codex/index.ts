import {defineStubHarness} from '../_shared/stub.js'

export const codex = defineStubHarness({
  id: 'codex',
  binName: 'codex',
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'none',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
})
