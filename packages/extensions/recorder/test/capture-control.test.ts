import {describe, expect, it} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import type {RecorderControl} from '../src/shared/protocol.js'

describe('createCaptureControl', () => {
  it('broadcasts live=true on capture start and live=false on stop', () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 5000)
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    const {captureId} = control.startCapture()
    const range = control.stopCapture(captureId)
    expect(seen).toEqual([{live: true}, {flush: true, live: false}])
    expect(range).toEqual({startTs: 5000, stopTs: 5000})
  })

  it('stopCapture with an unknown id returns null', () => {
    const control = createCaptureControl(createEventRing({windowMs: 60_000}), () => 0)
    expect(control.stopCapture('nope')).toBeNull()
  })

  it('awaitCoverage resolves once the ring covers the timestamp', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 0)
    const pending = control.awaitCoverage(2000, 1000)
    ring.append('a', [{type: 2, data: {}, timestamp: 2500}])
    await expect(pending).resolves.toBe(true)
  })

  it('awaitCoverage resolves false on timeout', async () => {
    const control = createCaptureControl(createEventRing({windowMs: 60_000}), () => 0)
    await expect(control.awaitCoverage(99_999, 30)).resolves.toBe(false)
  })
})
