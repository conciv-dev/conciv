import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {CONCIV_SNAPSHOT_EVENT, SnapshotSchema, aguiSnapshotFor} from '../src/ui-types.js'

describe('snapshot event', () => {
  it('wraps a snapshot in an AG-UI CUSTOM chunk', () => {
    const snapshot = SnapshotSchema.parse({generating: true, messages: [{id: 'u1', role: 'user', parts: []}]})
    const chunk = aguiSnapshotFor(snapshot)
    expect(chunk.type).toBe(EventType.CUSTOM)
    expect(chunk).toMatchObject({name: CONCIV_SNAPSHOT_EVENT, value: snapshot})
  })
})
