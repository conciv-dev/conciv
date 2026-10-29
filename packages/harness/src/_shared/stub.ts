import {makeTextAdapter} from '@conciv/ai/adapters'
import {ChatEventType, type ChatEvent} from '@conciv/ai/events'
import {
  defineHarness,
  type HarnessAdapter,
  type HarnessCapabilities,
  type HarnessChatConfig,
  type HarnessChatDeps,
} from '@conciv/protocol/harness-types'

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
