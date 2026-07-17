import {describe, expect, it} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureHub} from '../src/server/hub.js'
import type {RecorderControl} from '../src/shared/protocol.js'

describe('createCaptureHub', () => {
  it('broadcasts live=true on capture start and live=false on stop', () => {
    const ring = createEventRing({windowMs: 60_000})
    const hub = createCaptureHub(ring, () => 5000)
    const seen: RecorderControl[] = []
    hub.subscribe((control) => seen.push(control))
    const {captureId} = hub.startCapture()
    const range = hub.stopCapture(captureId)
    expect(seen).toEqual([{live: true}, {flush: true, live: false}])
    expect(range).toEqual({startTs: 5000, stopTs: 5000})
  })

  it('stopCapture with an unknown id returns null', () => {
    const hub = createCaptureHub(createEventRing({windowMs: 60_000}), () => 0)
    expect(hub.stopCapture('nope')).toBeNull()
  })

  it('awaitCoverage resolves once the ring covers the timestamp', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const hub = createCaptureHub(ring, () => 0)
    const pending = hub.awaitCoverage(2000, 1000)
    ring.append('a', [{type: 2, data: {}, timestamp: 2500}])
    await expect(pending).resolves.toBe(true)
  })

  it('awaitCoverage resolves false on timeout', async () => {
    const hub = createCaptureHub(createEventRing({windowMs: 60_000}), () => 0)
    await expect(hub.awaitCoverage(99_999, 30)).resolves.toBe(false)
  })
})
