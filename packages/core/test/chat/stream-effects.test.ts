import {expect, test} from 'vitest'
import {EventType} from '@tanstack/ai'
import {mintedSessionId} from '../../src/chat/run.js'

test('captures session-id custom events from any adapter', () => {
  const adapters = [
    {name: 'claude-code.session-id', token: '018f3a2b-4c5d-6e7f'},
    {name: 'codex.session-id', token: 'codex_9f3a-11ee'},
  ]
  const named = adapters.map((adapter) =>
    mintedSessionId({
      type: EventType.CUSTOM,
      name: adapter.name,
      value: {sessionId: adapter.token},
      timestamp: 1,
    }),
  )
  expect(named).toEqual(adapters.map((adapter) => adapter.token))
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
  })
  expect(unrelated).toBeNull()
})
