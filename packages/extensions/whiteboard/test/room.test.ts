import {describe, expect, it} from 'vitest'
import {ELEMENTS_KEY, ORIGIN, PINS_KEY, roomId} from '../src/room.js'

describe('room', () => {
  it('composes the room id from previewId and sessionId', () => {
    expect(roomId('p', 's')).toBe('p:s')
  })

  it('exposes the Yjs key constants', () => {
    expect(ELEMENTS_KEY).toBe('elements')
    expect(PINS_KEY).toBe('pins')
  })

  it('re-exports the shared ORIGIN map', () => {
    expect(ORIGIN.USER).toBe('user')
    expect(ORIGIN.AI).toBe('ai')
  })
})
