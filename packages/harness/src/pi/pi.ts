import type {ConfigProvider} from 'effect'
import {readOptionalConfig} from '../_shared/optional-config.js'
import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {piHistory, piSessionsRoot} from './history.js'
import {makeTextAdapter} from '../adapters/adapters.js'
import {ChatEventType, type ChatEvent} from '@conciv/types/chat-event-types'
import type {HarnessChatDeps} from '@conciv/types/harness-types'

function unsupportedChatConfig(id: string, binName: string): (deps: HarnessChatDeps) => Promise<HarnessChatConfig> {
  return async () => ({
    adapter: makeTextAdapter(id, async function* (): AsyncGenerator<ChatEvent> {
      yield {type: ChatEventType.RUN_STARTED, threadId: id, runId: id}
      yield {type: ChatEventType.RUN_ERROR, message: `${binName} is not installed or not yet supported`}
    }),
  })
}

export function pi(provider: ConfigProvider.ConfigProvider) {
  const root = piSessionsRoot(readOptionalConfig(provider, 'PI_CODING_AGENT_DIR'))
  return defineHarness({
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
      login: 'none',
    },
    chatConfig: unsupportedChatConfig('pi', 'pi'),
    history: piHistory(root),
    resume: {command: ({nativeId}) => ({bin: 'pi', args: ['--session', nativeId]})},
  })
}
