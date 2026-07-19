import {describe, expect, it, vi} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import {VIEWER_LEASE_MS, createCaptureControl} from '../src/server/capture-control.js'
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

  it('expires a live capture after the TTL and broadcasts live=false', () => {
    vi.useFakeTimers()
    const control = createCaptureControl(createEventRing({windowMs: 60_000}))
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    const {captureId} = control.startCapture()
    vi.advanceTimersByTime(10 * 60 * 1000 + 30_000)
    expect(control.stopCapture(captureId)).toBeNull()
    expect(seen).toEqual([{live: true}, {live: false}])
    control.dispose()
    vi.useRealTimers()
  })

  it('releaseAllCaptures empties actives and emits live=false once', () => {
    const control = createCaptureControl(createEventRing({windowMs: 60_000}), () => 0)
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    const first = control.startCapture()
    control.startCapture()
    control.releaseAllCaptures()
    expect(seen).toEqual([{live: true}, {live: true}, {live: false}])
    expect(control.stopCapture(first.captureId)).toBeNull()
    control.releaseAllCaptures()
    expect(seen).toEqual([{live: true}, {live: true}, {live: false}])
    control.dispose()
  })

  it('viewer presence drives live cadence without clobbering captures', () => {
    const control = createCaptureControl(createEventRing({windowMs: 60_000}), () => 0)
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    control.renewViewer('viewer-1')
    expect(seen).toEqual([{live: true}])
    const {captureId} = control.startCapture()
    control.dropViewer('viewer-1')
    expect(seen.at(-1)).toEqual({live: true})
    control.stopCapture(captureId)
    expect(seen.at(-1)).toEqual({flush: true, live: false})
    control.dispose()
  })

  it('stopping the last capture stays live while a viewer is watching', () => {
    const control = createCaptureControl(createEventRing({windowMs: 60_000}), () => 0)
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    control.renewViewer('viewer-1')
    control.stopCapture(control.startCapture().captureId)
    expect(seen.at(-1)).toEqual({flush: true, live: true})
    control.dispose()
  })

  it('an expiring capture leaves a watching viewer live', () => {
    vi.useFakeTimers()
    const control = createCaptureControl(createEventRing({windowMs: 60_000}))
    const seen: RecorderControl[] = []
    control.startCapture()
    control.subscribe((message) => seen.push(message))
    for (let elapsed = 0; elapsed < 11 * 60 * 1000; elapsed += 10_000) {
      control.renewViewer('viewer-1')
      vi.advanceTimersByTime(10_000)
    }
    expect(seen).toEqual([])
    control.dispose()
    vi.useRealTimers()
  })

  it('a viewer whose lease is never renewed expires instead of pinning live forever', () => {
    vi.useFakeTimers()
    const control = createCaptureControl(createEventRing({windowMs: 60_000}))
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    control.renewViewer('viewer-1')
    vi.advanceTimersByTime(VIEWER_LEASE_MS + 10_000)
    expect(seen).toEqual([{live: true}, {live: false}])
    control.dispose()
    vi.useRealTimers()
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
