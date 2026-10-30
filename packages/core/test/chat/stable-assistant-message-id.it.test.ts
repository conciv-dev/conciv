import {describe, it, expect} from 'vitest'
import {type ChatEvent, ChatEventType} from '@conciv/ai/events'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/ai/adapters'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {hydratedSnapshot} from '../helpers/fake-session.js'
import {foldChatEvents} from '@conciv/ai/server-testkit'

const REPLY_TEXT = 'a reply with no wire messageId'

async function* noMessageIdChatStream(): AsyncGenerator<ChatEvent> {
  yield {type: ChatEventType.RUN_STARTED, threadId: 'thread', runId: 'run'}
  yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: '', delta: REPLY_TEXT}
  yield {type: ChatEventType.RUN_FINISHED, threadId: 'thread', runId: 'run'}
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
        const keeper = await kit.turn('hello', {session: sessionId, runId: 'no-id-1', messageId: 'client-user-1'})
        const events = await keeper.done({hangGuardMs: 15_000})

        const clientMessages = foldChatEvents(events.all)
        const clientAssistantId = clientMessages.find((message) => message.role === 'assistant')?.id

        const secondSubscriber = await kit.turn('again', {
          session: sessionId,
          runId: 'no-id-2',
          messageId: 'client-user-2',
        })
        await secondSubscriber.done({hangGuardMs: 15_000})
        const coreAssistantId = (await hydratedSnapshot(kit, sessionId)).messages.find(
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
