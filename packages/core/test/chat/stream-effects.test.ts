import {expect, test} from 'vitest'
import {EventType} from '@tanstack/ai'
import {mintedSessionId} from '../../src/chat/run.js'

test('captures session-id custom events from any adapter', () => {
  const named = ['claude-code.session-id', 'codex.session-id'].map((name) =>
    mintedSessionId({type: EventType.CUSTOM, name, value: {sessionId: name}, timestamp: 1, threadId: 't', runId: 'r'}),
  )
  expect(named).toEqual(['claude-code.session-id', 'codex.session-id'])
  const text = mintedSessionId({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    delta: 'x',
    timestamp: 1,
    threadId: 't',
    runId: 'r',
  })
  expect(text).toBeNull()
  const unrelated = mintedSessionId({
    type: EventType.CUSTOM,
    name: 'file.changed',
    value: {sessionId: 'nope'},
    timestamp: 1,
    threadId: 't',
    runId: 'r',
  })
  expect(unrelated).toBeNull()
})
