import {describe, expect, test} from 'vitest'
import {createRoot, observable} from 'solid-js'
import {ChatEventType, type ChatEvent} from '@conciv/types/chat-event-types'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import {createChatSession, type ChatSessionHydration} from '../../src/session/session.js'
import {createTextChunks} from '../../src/testing.js'

describe('a refresh racing a send', () => {
  test('keeps the sent message and its streamed reply alongside the older history the refresh fetched, and keeps a message the server has not stored yet until a fetch holds it', async () => {
    const fetched = Promise.withResolvers<ChatSessionHydration>()
    const held = Promise.withResolvers<void>()
    const refreshes = [fetched.promise]
    const gates = [Promise.resolve(), held.promise]
    const replies = [createTextChunks('Short answer', 'reply')]
    const saved: ChatMessage[] = []
    const events = new TransformStream<ChatEvent, ChatEvent>()
    const engine = events.writable.getWriter()
    const session = createRoot(() =>
      createChatSession({
        sessionId: 'refresh-race',
        connect: () => ({
          subscribe: () => events.readable,
          send: async (_messages, _data, _signal, run) => {
            await gates.shift()
            const ids = {threadId: run.threadId, runId: run.runId}
            await engine.write({type: ChatEventType.RUN_STARTED, ...ids})
            for (const chunk of replies.shift() ?? []) await engine.write(chunk)
            await engine.write({type: ChatEventType.RUN_FINISHED, ...ids, finishReason: 'stop'})
          },
          refresh: () =>
            refreshes.shift() ??
            Promise.resolve({messages: [...saved], messageHarness: {}, lastRun: null, pendingApprovals: []}),
          close: () => undefined,
        }),
        stop: async () => undefined,
        decide: async () => undefined,
      }),
    )
    const texts = (): string[] =>
      session
        .messages()
        .flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])))

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

    saved.splice(0, saved.length, ...session.messages())
    const holding = session.sendMessage('Hold on')
    await expect.poll(texts).toEqual(['Be quick', 'Short answer', 'Hold on'])
    const storedIds = saved.map((message) => message.id)
    const unstored = session.messages().filter((message) => !storedIds.includes(message.id))
    await session.refresh()
    saved.push(...unstored)
    held.resolve()
    await holding
    await expect.poll(session.runInProgress).toBe(false)

    expect(texts()).toEqual(['Be quick', 'Short answer', 'Hold on'])

    await session.refresh()

    expect(texts()).toEqual(['Be quick', 'Short answer', 'Hold on'])
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
