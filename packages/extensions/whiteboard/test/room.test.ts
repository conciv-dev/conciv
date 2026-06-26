import {describe, expect, it} from 'vitest'
import {roomId} from '../src/shared/room.js'

describe('roomId', () => {
  it('joins previewId and sessionId with a colon', () => {
    expect(roomId('local', 'mandarax_x')).toBe('local:mandarax_x')
  })

  it('falls back to a local session when the sessionId is empty', () => {
    expect(roomId('local', '')).toBe('local:local')
  })
})
