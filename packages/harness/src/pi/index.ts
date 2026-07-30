import {defineHarness} from '@conciv/protocol/harness-types'
import {unsupportedChatConfig} from '../_shared/stub.js'
import {piHistory} from './history.js'

export const pi = defineHarness({
  id: 'pi',
  binName: 'pi',
  displayName: 'Pi',
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: true,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
  chatConfig: unsupportedChatConfig('pi', 'pi'),
  history: piHistory,
  connect: {
    plan: (ctx) => ({
      argv: [
        'pi',
        ...(ctx.harnessSessionId ? ['--session-id', ctx.harnessSessionId] : []),
        ...(ctx.model ? ['--model', ctx.model] : []),
      ],
      env: {},
      files: [],
    }),
  },
})
