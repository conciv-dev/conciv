import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {StreamProcessor as ClientStreamProcessor} from '@tanstack/ai/client'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {lastSnapshot} from '../helpers/snapshots.js'

const REPLY_TEXT = 'a reply with no wire messageId'

async function* noMessageIdChatStream(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'thread', runId: 'run'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: '', delta: REPLY_TEXT}
  yield {type: EventType.RUN_FINISHED, threadId: 'thread', runId: 'run'}
}

function harnessWithoutWireMessageId(): HarnessAdapter {
  return defineHarness({
    id: 'no-messageid-harness',
    binName: 'true',
    chatConfig: () => ({adapter: makeTextAdapter('no-messageid-harness', () => noMessageIdChatStream())}),
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
  const kit = await createTestkit(harnessWithoutWireMessageId(), bootCoreApp({})).setup()
  const sessionId = await kit.session()
  return {kit, sessionId}
}

describe('the assistant message id the client derives from the wire matches the one core persists (IT)', () => {
  it(
    'agrees with the id core minted into the run log, even when the adapter forwards no messageId',
    {
      timeout: 60_000,
    },
    async () => {
      const {kit, sessionId} = await openSession()
      try {
        const keeper = await kit.attach(sessionId)
        await kit.rpc.chat.send({runId: 'no-id-1', sessionId, text: 'hello', messageId: 'client-user-1'})
        const events = await keeper.done({hangGuardMs: 15_000})

        const clientProcessor = new ClientStreamProcessor({})
        for (const chunk of events.all) clientProcessor.processChunk(chunk)
        const clientAssistantId = clientProcessor.getMessages().find((message) => message.role === 'assistant')?.id

        const secondSubscriber = await kit.attach(sessionId)
        await kit.rpc.chat.send({runId: 'no-id-2', sessionId, text: 'again', messageId: 'client-user-2'})
        const secondEvents = await secondSubscriber.done({hangGuardMs: 15_000})
        const coreAssistantId = lastSnapshot(secondEvents.all).messages.find(
          (message) => message.role === 'assistant',
        )?.id

        expect(clientAssistantId).toBeDefined()
        expect(clientAssistantId).toEqual(coreAssistantId)
      } finally {
        await kit.cleanup()
      }
    },
  )
})
