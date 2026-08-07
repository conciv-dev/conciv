import {describe, expect, it, vi} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import {VIEWER_LEASE_MS, createCaptureControl} from '../src/server/capture-control.js'
import type {RecorderControl} from '../src/shared/protocol.js'

describe('createCaptureControl', () => {
  it('broadcasts live plus a fresh snapshot request on capture start and live=false on stop', () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 5000)
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    const {captureId} = control.startCapture()
    const range = control.stopCapture(captureId)
    expect(seen).toEqual([
      {live: true, snapshot: true, flush: true},
      {flush: true, live: false},
    ])
    expect(range).toEqual({startTs: 5000, stopTs: 5000, appendCursor: 0})
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
    expect(seen).toEqual([{live: true, snapshot: true, flush: true}, {live: false}])
    control.dispose()
    vi.useRealTimers()
  })

  it('viewer presence drives live cadence without clobbering captures', () => {
    const control = createCaptureControl(createEventRing({windowMs: 60_000}), () => 0)
    const seen: RecorderControl[] = []
    control.subscribe((message) => seen.push(message))
    control.renewViewer('viewer-1')
    expect(seen).toEqual([{live: true}])
    const {captureId} = control.startCapture()
    control.dropViewer('viewer-1')
    expect(seen.at(-1)).toEqual({live: true, snapshot: true, flush: true})
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

  it('awaitAppendAfter resolves once a fresh append lands', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 0)
    const pending = control.awaitAppendAfter(ring.head(), 1000)
    ring.append('a', [{type: 2, data: {}, timestamp: 2500}])
    await expect(pending).resolves.toBe(true)
    control.dispose()
  })

  it('awaitAppendAfter resolves false on timeout', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 0)
    await expect(control.awaitAppendAfter(ring.head(), 30)).resolves.toBe(false)
    control.dispose()
  })

  it('start coverage is not satisfied by events retained from before the start emit', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 1000)
    ring.append('skewed', [{type: 2, data: {}, timestamp: 5000}])
    const {captureId, appendCursor} = control.startCapture()
    await expect(control.awaitAppendAfter(appendCursor, 50)).resolves.toBe(false)
    control.stopCapture(captureId)
    control.dispose()
  })

  it('a fresh append from a client with a lagging clock covers the start', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 1000)
    const {appendCursor} = control.startCapture()
    const pending = control.awaitAppendAfter(appendCursor, 200)
    ring.append('fresh', [{type: 2, data: {}, timestamp: 900}])
    await expect(pending).resolves.toBe(true)
    control.dispose()
  })

  it('an append landing between the start emit and the wait still counts', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 1000)
    const {appendCursor} = control.startCapture()
    ring.append('fresh', [{type: 2, data: {}, timestamp: 900}])
    await expect(control.awaitAppendAfter(appendCursor, 50)).resolves.toBe(true)
    control.dispose()
  })

  it('two concurrent starts both resolve on the next fresh append', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 1000)
    const first = control.startCapture()
    const second = control.startCapture()
    const firstPending = control.awaitAppendAfter(first.appendCursor, 200)
    const secondPending = control.awaitAppendAfter(second.appendCursor, 200)
    ring.append('fresh', [{type: 2, data: {}, timestamp: 900}])
    await expect(firstPending).resolves.toBe(true)
    await expect(secondPending).resolves.toBe(true)
    control.dispose()
  })

  it('stop flush answered before the wait registers still counts', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 1000)
    const {captureId} = control.startCapture()
    control.subscribe((message) => {
      if (message.flush) ring.append('fast', [{type: 2, data: {}, timestamp: 1200}])
    })
    const range = control.stopCapture(captureId)
    if (!range) throw new Error('capture vanished')
    await expect(control.awaitAppendAfter(range.appendCursor, 50)).resolves.toBe(true)
    control.dispose()
  })

  it('emit returns the pre-broadcast cursor so a synchronous flush response still counts', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 1000)
    control.subscribe((message) => {
      if (message.flush) ring.append('fast', [{type: 2, data: {}, timestamp: 1200}])
    })
    const appendCursor = control.emit({flush: true})
    await expect(control.awaitAppendAfter(appendCursor, 50)).resolves.toBe(true)
    control.dispose()
  })

  it('an append landing after the timeout fires does not flip the result', async () => {
    const ring = createEventRing({windowMs: 60_000})
    const control = createCaptureControl(ring, () => 1000)
    const {appendCursor} = control.startCapture()
    const pending = control.awaitAppendAfter(appendCursor, 20)
    await new Promise((resolve) => setTimeout(resolve, 40))
    ring.append('late', [{type: 2, data: {}, timestamp: 2000}])
    await expect(pending).resolves.toBe(false)
    control.dispose()
  })
})
