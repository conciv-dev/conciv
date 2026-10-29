import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {StreamProcessor as ClientStreamProcessor} from '@tanstack/ai-client'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'

const ASSISTANT_MESSAGE_ID = 'tool-first-assistant-1'
const TOOL_CALL_ID = 'tool-first-call-1'

async function* toolFirstThenTextStream(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run'}
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId: TOOL_CALL_ID,
    toolCallName: 'lookupWeather',
    parentMessageId: ASSISTANT_MESSAGE_ID,
  }
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId: TOOL_CALL_ID, delta: '{"location":"Berlin"}'}
  yield {type: EventType.TOOL_CALL_END, toolCallId: TOOL_CALL_ID}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: ASSISTANT_MESSAGE_ID, role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: ASSISTANT_MESSAGE_ID, delta: 'AAAA'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: ASSISTANT_MESSAGE_ID, delta: 'BBBB'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: ASSISTANT_MESSAGE_ID, delta: 'CCCC'}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: ASSISTANT_MESSAGE_ID}
  yield {type: EventType.RUN_FINISHED, threadId: 'thread', runId: 'run'}
}

function harnessWithToolFirstTurn(): HarnessAdapter {
  return defineHarness({
    id: 'tool-first-text-harness',
    binName: 'true',
    chatConfig: () => ({adapter: makeTextAdapter('tool-first-text-harness', () => toolFirstThenTextStream())}),
    models: undefined,
    tty: undefined,
    capabilities: {
      resume: false,
      permissionGate: 'none',
      compaction: false,
      systemPrompt: 'none',
      mcp: 'none',
      imageInput: false,
      init: 'none',
      transcriptHistory: false,
      slashCommands: 'none',
    },
  })
}

async function openSession(): Promise<{kit: Kit; sessionId: string}> {
  const kit = await createTestkit(harnessWithToolFirstTurn(), bootCoreApp({})).setup()
  const sessionId = await kit.session()
  return {kit, sessionId}
}

describe('the client StreamProcessor keeps the first text delta of a tool-first assistant turn', () => {
  it(
    'does not drop the opening TEXT_MESSAGE_CONTENT delta when TOOL_CALL_START precedes TEXT_MESSAGE_START (#1247)',
    {
      timeout: 60_000,
    },
    async () => {
      const {kit, sessionId} = await openSession()
      try {
        const keeper = await kit.turn('what is the weather', {
          session: sessionId,
          runId: 'tool-first-1',
          messageId: 'client-user-1',
        })
        const events = await keeper.done({hangGuardMs: 15_000})

        const clientProcessor = new ClientStreamProcessor({})
        for (const chunk of events.all) clientProcessor.processChunk(chunk)
        const assistantMessage = clientProcessor.getMessages().find((message) => message.role === 'assistant')
        const text = assistantMessage?.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.content)
          .join('')

        expect(text).toEqual('AAAABBBBCCCC')
      } finally {
        await kit.cleanup()
      }
    },
  )
})
