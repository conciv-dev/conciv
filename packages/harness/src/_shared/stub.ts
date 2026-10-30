import {makeTextAdapter} from '@conciv/ai/server'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {type HarnessCapabilities, type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {defineHarness, type HarnessAdapter, type HarnessChatConfig} from './contract.js'

export function unsupportedChatConfig(id: string, binName: string): (deps: HarnessChatDeps) => HarnessChatConfig {
  return () => ({
    adapter: makeTextAdapter(id, async function* (): AsyncGenerator<ChatEvent> {
      yield {type: ChatEventType.RUN_STARTED, threadId: id, runId: id}
      yield {type: ChatEventType.RUN_ERROR, message: `${binName} is not installed or not yet supported`}
    }),
  })
}

export function defineStubHarness(o: {
  id: string
  binName: string
  capabilities: HarnessCapabilities & {transcriptHistory: false; compaction: false; slashCommands: 'none'; init: 'none'}
}): HarnessAdapter {
  return defineHarness({...o, chatConfig: unsupportedChatConfig(o.id, o.binName)})
}
