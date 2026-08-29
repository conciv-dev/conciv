import {describe, expect, it} from 'vitest'
import type {StreamChunk, UIMessage} from '@tanstack/ai'
import {makeSend} from '../../src/chat/run.js'
import {sessionSnapshot} from '../../src/chat/thread.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'
import {drivingRun} from '../helpers/run-drivers.js'
import {firstSnapshot, type SnapshotView} from '../helpers/snapshots.js'

function storedPartTypes(message: UIMessage | undefined): string[] {
  return (message?.parts ?? []).map((part) => part.type)
}

async function loggedSnapshot(fixture: ChatFixture, runId: string): Promise<SnapshotView> {
  const chunks: StreamChunk[] = []
  for await (const entry of fixture.chat.runControl.attach(runId, '-1')) chunks.push(entry.chunk)
  return firstSnapshot(chunks)
}

describe('the thread snapshot keeps the identity a live run streamed (IT)', () => {
  it('reads back one assistant message per turn, ids unrepeated, after a tool call and an answer', async () => {
    const fixture = await makeChatFixture()
    try {
      fixture.harness.script.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'First answer.'})
      await makeSend(fixture.chat)(fixture.sessionId, 'thread-identity-1', 'first question')
      await drivingRun(fixture.chat, 'thread-identity-1').settled

      const snapshot = sessionSnapshot(fixture.chat, fixture.sessionId)
      const ids = snapshot.map((message) => message.id)
      expect(ids).toEqual([...new Set(ids)])
      expect(snapshot.map((message) => message.role)).toEqual(['user', 'assistant'])
      expect(storedPartTypes(snapshot[1])).toEqual(['tool-call', 'tool-result', 'text'])
    } finally {
      await fixture.dispose()
    }
  }, 60_000)

  it('opens the second run with the first turn as one assistant message, not two under one id', async () => {
    const fixture = await makeChatFixture()
    try {
      fixture.harness.script.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'First answer.'})
      await makeSend(fixture.chat)(fixture.sessionId, 'thread-identity-2', 'first question')
      await drivingRun(fixture.chat, 'thread-identity-2').settled

      fixture.harness.script.scriptTurn({toolCalls: [{name: 'Read', input: {filePath: 'second.ts'}}], text: 'Second.'})
      await makeSend(fixture.chat)(fixture.sessionId, 'thread-identity-3', 'second question')
      await drivingRun(fixture.chat, 'thread-identity-3').settled

      const opening = await loggedSnapshot(fixture, 'thread-identity-3')
      const ids = opening.messages.map((message) => message.id)
      expect(ids).toEqual([...new Set(ids)])
      expect(opening.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
      expect(opening.messages[1]?.parts.map((part) => part.type)).toEqual(['tool-call', 'tool-result', 'text'])
    } finally {
      await fixture.dispose()
    }
  }, 60_000)
})
