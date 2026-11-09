import {defineHarness} from '../_shared/contract.js'
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
    init: 'none',
  },
  chatConfig: unsupportedChatConfig('pi', 'pi'),
  history: piHistory,
  resume: {command: ({nativeId}) => ({bin: 'pi', args: ['--session', nativeId]})},
})
