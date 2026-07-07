import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineHarness, type HarnessAdapter, type HarnessCapabilities} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from './text-adapter.js'

export function defineStubHarness(o: {
  id: string
  binName: string
  capabilities: HarnessCapabilities & {transcriptHistory: false; compaction: false; slashCommands: 'none'}
}): HarnessAdapter {
  return defineHarness({
    ...o,
    chatConfig: () => ({
      adapter: makeTextAdapter(o.id, async function* (): AsyncGenerator<StreamChunk> {
        yield {type: EventType.RUN_STARTED, threadId: o.id, runId: o.id}
        yield {type: EventType.RUN_ERROR, message: `${o.binName} is not installed or not yet supported`}
      }),
    }),
  })
}
