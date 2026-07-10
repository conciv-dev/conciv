import {expect, test} from 'vitest'
import {EventType} from '@tanstack/ai'
import {tapSessionId} from '../src/chat/run.js'

test('captures session-id custom events from any adapter', () => {
  const ids: string[] = []
  for (const name of ['claude-code.session-id', 'codex.session-id']) {
    tapSessionId(
      {type: EventType.CUSTOM, name, value: {sessionId: name}, timestamp: 1, threadId: 't', runId: 'r'},
      (id) => ids.push(id),
    )
  }
  tapSessionId(
    {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'x', timestamp: 1, threadId: 't', runId: 'r'},
    (id) => ids.push(id),
  )
  tapSessionId(
    {type: EventType.CUSTOM, name: 'file.changed', value: {sessionId: 'nope'}, timestamp: 1, threadId: 't', runId: 'r'},
    (id) => ids.push(id),
  )
  expect(ids).toEqual(['claude-code.session-id', 'codex.session-id'])
})
