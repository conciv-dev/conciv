import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {aguiSnapshotFor} from '../src/ui-types.js'

describe('snapshot event', () => {
  it('snapshot is a native MESSAGES_SNAPSHOT chunk carrying UIMessages verbatim', () => {
    const messages = [{id: 'm1', role: 'user' as const, parts: [{type: 'text' as const, content: 'hi'}]}]
    const chunk = aguiSnapshotFor(messages)
    expect(chunk.type).toBe(EventType.MESSAGES_SNAPSHOT)
    if (chunk.type === EventType.MESSAGES_SNAPSHOT) expect(chunk.messages).toEqual(messages)
  })
})
