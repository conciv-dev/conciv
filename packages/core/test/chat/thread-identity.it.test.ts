import {describe, expect, it} from 'vitest'
import type {UIMessage} from '@tanstack/ai'
import {startTurn} from '../helpers/detached-turn.js'
import {sessionSnapshot} from '../../src/chat/thread.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {awaitRunSettled} from '../../src/chat/run-settled.js'

function storedPartTypes(message: UIMessage | undefined): string[] {
  return (message?.parts ?? []).map((part) => part.type)
}

describe('the thread snapshot keeps the identity a live run streamed (IT)', () => {
  it('reads back one assistant message per turn, ids unrepeated, after a tool call and an answer', async () => {
    const fixture = await makeChatFixture()
    try {
      fixture.harness.script.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'First answer.'})
      await startTurn(fixture.chat, fixture.sessionId, 'thread-identity-1', 'first question')
      await awaitRunSettled(fixture.chat.runs, 'thread-identity-1')

      const snapshot = sessionSnapshot(fixture.chat, fixture.sessionId)
      const ids = snapshot.map((message) => message.id)
      expect(ids).toEqual([...new Set(ids)])
      expect(snapshot.map((message) => message.role)).toEqual(['user', 'assistant'])
      expect(storedPartTypes(snapshot[1])).toEqual(['tool-call', 'tool-result', 'text'])
    } finally {
      await fixture.dispose()
    }
  }, 60_000)

  it('leaves the first turn as one assistant message under one id when the second run appends', async () => {
    const fixture = await makeChatFixture()
    try {
      fixture.harness.script.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'First answer.'})
      await startTurn(fixture.chat, fixture.sessionId, 'thread-identity-2', 'first question')
      await awaitRunSettled(fixture.chat.runs, 'thread-identity-2')
      const firstAssistantId = sessionSnapshot(fixture.chat, fixture.sessionId)[1]?.id

      fixture.harness.script.scriptTurn({toolCalls: [{name: 'Read', input: {filePath: 'second.ts'}}], text: 'Second.'})
      await startTurn(fixture.chat, fixture.sessionId, 'thread-identity-3', 'second question')
      await awaitRunSettled(fixture.chat.runs, 'thread-identity-3')

      const opening = sessionSnapshot(fixture.chat, fixture.sessionId)
      const ids = opening.map((message) => message.id)
      expect(ids).toEqual([...new Set(ids)])
      expect(opening.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
      expect(firstAssistantId).toBeDefined()
      expect(opening[1]?.id).toBe(firstAssistantId)
      expect(storedPartTypes(opening[1])).toEqual(['tool-call', 'tool-result', 'text'])
    } finally {
      await fixture.dispose()
    }
  }, 60_000)
})
