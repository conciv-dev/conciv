import {defineStubHarness} from '../_shared/stub.js'

export const pi = defineStubHarness({
  id: 'pi',
  binName: 'pi',
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
