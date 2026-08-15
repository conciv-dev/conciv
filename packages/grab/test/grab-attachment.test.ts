import {describe, expect, it} from 'vitest'
import {
  GRAB_FILE_NAME,
  GRAB_MIME,
  grabToFile,
  grabToPayload,
  imagePreviewBudget,
  MAX_PAYLOAD_BYTES,
  parseGrabPayload,
} from '../src/grab-attachment.js'
import type {Grab, GrabPreview} from '../src/grab.js'

const GRAB: Grab = {
  text: '<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1 class="title">Start simple</h1>',
  preview: {kind: 'dom', html: '<div><h1>Start simple</h1></div>', width: 320, height: 48},
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 320, height: 48},
}

describe('grab attachment payload', () => {
  it('round-trips a dom grab through a file body', async () => {
    const file = grabToFile(GRAB)

    expect(file.type).toBe(GRAB_MIME)
    expect(file.name).toBe(GRAB_FILE_NAME)
    expect(parseGrabPayload(await file.text())).toEqual({
      text: GRAB.text,
      snippet: GRAB.snippet,
      source: GRAB.source,
      rect: GRAB.rect,
      preview: {kind: 'dom', html: '<div><h1>Start simple</h1></div>', width: 320, height: 48},
    })
  })

  it('keeps an image preview instead of discarding it', async () => {
    const imageGrab: Grab = {
      ...GRAB,
      preview: {kind: 'image', dataUrl: 'data:image/png;base64,AAA', width: 10, height: 10},
    }

    const payload = parseGrabPayload(await grabToFile(imageGrab).text())

    expect(payload?.preview).toEqual({kind: 'image', dataUrl: 'data:image/png;base64,AAA', width: 10, height: 10})
  })

  it('drops the preview when the payload would exceed the persistence budget', async () => {
    const huge: Grab = {...GRAB, preview: {kind: 'dom', html: '<p>é</p>'.repeat(200_000), width: 10, height: 10}}

    const payload = parseGrabPayload(await grabToFile(huge).text())

    expect(payload?.preview).toBeNull()
    expect(payload?.text).toBe(GRAB.text)
  })

  it('truncates the text when even the preview-less payload is over budget', async () => {
    const wordy: Grab = {...GRAB, text: 'é'.repeat(500_000), snippet: 'é'.repeat(500_000), preview: GRAB.preview}

    const file = grabToFile(wordy)
    const payload = parseGrabPayload(await file.text())

    expect(payload?.preview).toBeNull()
    expect(payload?.snippet).toBeUndefined()
    expect(new TextEncoder().encode(await file.text()).length).toBeLessThanOrEqual(750_000)
    expect(payload?.text.endsWith('…')).toBe(true)
  })

  it('returns null for a body that is not a grab payload', () => {
    expect(parseGrabPayload('{"nope":true}')).toBeNull()
    expect(parseGrabPayload('not json at all')).toBeNull()
  })

  it('refuses an image preview whose source is not a data url', () => {
    const forged = JSON.stringify({
      text: GRAB.text,
      source: null,
      rect: null,
      preview: {kind: 'image', dataUrl: 'https://tracker.test/pixel.png', width: 1, height: 1},
    })

    expect(parseGrabPayload(forged)).toBeNull()
  })

  it('refuses an image preview that smuggles a script scheme', () => {
    const forged = JSON.stringify({
      text: GRAB.text,
      source: null,
      rect: null,
      preview: {kind: 'image', dataUrl: 'javascript:alert(1)', width: 1, height: 1},
    })

    expect(parseGrabPayload(forged)).toBeNull()
  })

  it('refuses a body larger than the payload budget before parsing it', () => {
    const oversized = JSON.stringify({
      text: 'x'.repeat(MAX_PAYLOAD_BYTES + 1),
      source: null,
      rect: null,
      preview: null,
    })

    expect(oversized.length).toBeGreaterThan(MAX_PAYLOAD_BYTES)
    expect(parseGrabPayload(oversized)).toBeNull()
  })

  it('reserves the non-image payload overhead when budgeting an image preview', () => {
    const preview: Extract<GrabPreview, {kind: 'image'}> = {kind: 'image', dataUrl: '', width: 40, height: 20}
    const wordy: Grab = {...GRAB, text: 'x'.repeat(50_000), preview}

    expect(imagePreviewBudget(wordy, preview)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES - 50_000)
  })

  it('keeps an image preview that was fitted to the reserved budget', () => {
    const preview: Extract<GrabPreview, {kind: 'image'}> = {kind: 'image', dataUrl: '', width: 40, height: 20}
    const wordy: Grab = {...GRAB, text: 'x'.repeat(50_000), preview}
    const budget = imagePreviewBudget(wordy, preview)
    const fitted: Grab = {...wordy, preview: {...preview, dataUrl: 'd'.repeat(budget)}}
    const wholeBudget: Grab = {...wordy, preview: {...preview, dataUrl: 'd'.repeat(MAX_PAYLOAD_BYTES)}}

    expect(grabToPayload(fitted).preview?.kind).toBe('image')
    expect(grabToPayload(wholeBudget).preview).toBeNull()
  })
})
