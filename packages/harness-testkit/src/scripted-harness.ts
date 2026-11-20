import {makeTextAdapter} from '@conciv/ai/server'
import {defineHarness, type HarnessAdapter} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'

const FALLBACK_REPLY = 'Hello from conciv'

const FAKE_HARNESS_ID = 'engine'

type RunRequest = {threadId?: string; runId?: string}

async function* replyEvents(deps: HarnessChatDeps, request: RunRequest, text: string): AsyncGenerator<ChatEvent> {
  const run = {threadId: request.threadId ?? deps.sessionId, runId: request.runId ?? crypto.randomUUID()}
  const messageId = `${run.runId}-reply`
  yield {type: ChatEventType.RUN_STARTED, ...run}
  yield {
    type: ChatEventType.CUSTOM,
    name: 'fake.session-id',
    value: {sessionId: deps.resumeSessionId ?? `fake-${deps.sessionId}`},
    ...run,
  }
  yield {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
  yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: text}
  yield {type: ChatEventType.TEXT_MESSAGE_END, messageId}
  yield {type: ChatEventType.RUN_FINISHED, ...run}
}

function scriptedChat(name: string, replies: string[]): HarnessAdapter['chatConfig'] {
  const queued = [...replies]
  return (deps) => ({
    adapter: makeTextAdapter(name, (request) => replyEvents(deps, request, queued.shift() ?? FALLBACK_REPLY)),
  })
}

export function scriptedHarness(harness: HarnessAdapter | undefined, replies: string[]): HarnessAdapter {
  if (harness !== undefined) return {...harness, chatConfig: scriptedChat('scripted', replies)}
  return defineHarness({
    id: FAKE_HARNESS_ID,
    binName: 'true',
    chatConfig: scriptedChat(FAKE_HARNESS_ID, replies),
    capabilities: {
      resume: false,
      permissionGate: 'none',
      compaction: false,
      systemPrompt: 'none',
      mcp: 'none',
      init: 'none',
      imageInput: false,
      transcriptHistory: false,
      slashCommands: 'none',
    },
  })
}
