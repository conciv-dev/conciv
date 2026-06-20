import {expect, test} from 'vitest'
import {createCanvasDoc} from '../src/spike/canvas-doc.js'

// Two docs on the same room, wired as a manual sync relay. A USER edit must propagate, and applying
// a peer's update as REMOTE must NOT echo back (the feedback-loop guard) — real Yjs, no mocks.
test('a USER edit syncs to a peer and a REMOTE apply does not echo back', () => {
  const a = createCanvasDoc('room-1')
  const b = createCanvasDoc('room-1')

  // Relay each doc's local updates to the other; skip updates that came from applying a remote one.
  a.doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== a.origin.REMOTE) b.applyRemote(u)
  })
  b.doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== b.origin.REMOTE) a.applyRemote(u)
  })

  a.addElement({id: 'r1', version: 1})
  expect(a.count()).toBe(1)
  expect(b.count()).toBe(1)

  b.addElement({id: 'r2', version: 1})
  expect(b.count()).toBe(2)
  expect(a.count()).toBe(2)

  a.dispose()
  b.dispose()
})

test('addElement is keyed by id — re-adding the same id updates, not duplicates', () => {
  const a = createCanvasDoc('room-2')
  a.addElement({id: 'r1', version: 1})
  a.addElement({id: 'r1', version: 2})
  expect(a.count()).toBe(1)
  a.dispose()
})
