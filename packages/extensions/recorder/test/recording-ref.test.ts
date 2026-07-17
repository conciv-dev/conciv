import {describe, expect, it} from 'vitest'
import {
  RECORDER_MIME,
  decodeRecordingRef,
  parseRecordingRefJson,
  recordingPoster,
  recordingRefJson,
} from '../src/shared/protocol.js'

const ref = {recordingId: 'r1', poster: 'Screen recording · 2 actions · 42s'}

describe('recording ref', () => {
  it('round-trips through the framework encoding (File JSON -> base64 document value)', () => {
    const fileText = recordingRefJson(ref)
    const documentValue = btoa(fileText)
    expect(decodeRecordingRef(documentValue)).toEqual(ref)
  })
  it('parses raw file text for the pending-composer path', () => {
    expect(parseRecordingRefJson(recordingRefJson(ref))).toEqual(ref)
  })
  it('returns null for garbage in both decoders', () => {
    expect(decodeRecordingRef('not-base64-json')).toBeNull()
    expect(parseRecordingRefJson('{nope')).toBeNull()
  })
  it('summarizes actions and duration', () => {
    expect(
      recordingPoster([
        {ts: 1000, kind: 'click', detail: 'a'},
        {ts: 43000, kind: 'input', detail: 'b'},
      ]),
    ).toBe('Screen recording · 2 actions · 42s')
  })
  it('exposes the namespaced mime', () => {
    expect(RECORDER_MIME).toBe('application/x-conciv-recorder')
  })
})
