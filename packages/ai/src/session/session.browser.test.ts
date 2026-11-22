import {describe, expect, test} from 'vitest'
import {createRoot, observable} from 'solid-js'
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

    await expect.poll(() => session.messages().map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(session.messages().flatMap((message) => message.parts)).toEqual([
      expect.objectContaining({type: 'text', content: 'Be quick'}),
      expect.objectContaining({type: 'text', content: 'Short answer'}),
    ])
  })
})

describe('a burst of streamed chunks', () => {
  test('reaches the thread as the sent message, then one update with the whole reply, never the words in between', async () => {
    const events = new TransformStream<ChatEvent, ChatEvent>()
    const engine = events.writable.getWriter()
    const shown: string[] = []
    const session = createRoot(() =>
      createChatSession({
        sessionId: 'burst',
        connect: () => ({
          subscribe: () => events.readable,
          send: async (_messages, _data, _signal, run) => {
            const ids = {threadId: run.threadId, runId: run.runId}
            await engine.write({type: ChatEventType.RUN_STARTED, ...ids})
            await engine.write({type: ChatEventType.TEXT_MESSAGE_START, messageId: 'reply', role: 'assistant'})
            for (const delta of ['One ', 'two ', 'three ', 'four ', 'five.']) {
              await engine.write({type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'reply', delta})
            }
            await engine.write({type: ChatEventType.TEXT_MESSAGE_END, messageId: 'reply'})
            await engine.write({type: ChatEventType.RUN_FINISHED, ...ids, finishReason: 'stop'})
          },
          refresh: async () => ({messages: [], messageHarness: {}, lastRun: null, pendingApprovals: []}),
          close: () => undefined,
        }),
        stop: async () => undefined,
        decide: async () => undefined,
      }),
    )
    observable(session.messages).subscribe((messages) =>
      shown.push(
        messages
          .flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])))
          .join(' | '),
      ),
    )

    await session.sendMessage('Count to five')

    await expect.poll(() => shown.at(-1)).toBe('Count to five | One two three four five.')
    expect(shown).toEqual(['', 'Count to five', 'Count to five | One two three four five.'])
  })
})
