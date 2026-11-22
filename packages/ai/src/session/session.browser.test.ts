import {describe, expect, test} from 'vitest'
import {createRoot} from 'solid-js'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {createChatSession, type ChatSessionHydration} from './session.js'
import {createTextChunks} from '../testkit.js'

describe('a refresh still in flight when the user sends', () => {
  test('keeps the sent message and its streamed reply alongside the older history the refresh fetched', async () => {
    const fetched = Promise.withResolvers<ChatSessionHydration>()
    const events = new TransformStream<ChatEvent, ChatEvent>()
    const engine = events.writable.getWriter()
    const session = createRoot(() =>
      createChatSession({
        sessionId: 'refresh-race',
        connect: () => ({
          subscribe: () => events.readable,
          send: async (_messages, _data, _signal, run) => {
            const ids = {threadId: run.threadId, runId: run.runId}
            await engine.write({type: ChatEventType.RUN_STARTED, ...ids})
            for (const chunk of createTextChunks('Short answer', 'reply')) await engine.write(chunk)
            await engine.write({type: ChatEventType.RUN_FINISHED, ...ids, finishReason: 'stop'})
          },
          refresh: () => fetched.promise,
          close: () => undefined,
        }),
        stop: async () => undefined,
        decide: async () => undefined,
      }),
    )

    const refreshed = session.refresh()
    const sent = session.sendMessage('Be quick')
    fetched.resolve({messages: [], messageHarness: {}, lastRun: null, pendingApprovals: []})
    await refreshed
    await sent

    expect(session.messages().map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(session.messages().flatMap((message) => message.parts)).toEqual([
      expect.objectContaining({type: 'text', content: 'Be quick'}),
      expect.objectContaining({type: 'text', content: 'Short answer'}),
    ])
  })
})
