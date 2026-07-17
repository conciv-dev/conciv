import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {recordingAttachment} from '../src/server/attachment.js'
import {createRecordingStore} from '../src/server/recordings.js'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import type {RecorderRuntime} from '../src/server/runtime.js'

function runtimeFixture(): RecorderRuntime {
  const ring = createEventRing({windowMs: 60_000})
  return {
    ring,
    control: createCaptureControl(ring),
    config: {masking: 'none', windowMinutes: 10, console: true},
    renderer: async () => null,
    recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
  }
}

const documentPart = (recordingId: string) => ({
  type: 'document' as const,
  source: {
    type: 'data' as const,
    mimeType: 'application/x-conciv-recorder',
    value: btoa(JSON.stringify({recordingId, poster: 'p'})),
  },
})

describe('recording expand', () => {
  it('returns log text for a saved recording', async () => {
    const runtime = runtimeFixture()
    const saved = await runtime.recordings.save([
      {type: 2, data: {node: {}}, timestamp: 1},
      {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2},
    ])
    if (!saved.ok) throw new Error('expected ok')
    const expand = recordingAttachment.__expand
    if (!expand) throw new Error('expand not registered')
    const parts = await expand(documentPart(saved.recordingId), {recorder: runtime})
    expect(parts.some((part) => part.type === 'text')).toBe(true)
  })

  it('returns an expired text part when the recording is gone', async () => {
    const expand = recordingAttachment.__expand
    if (!expand) throw new Error('expand not registered')
    const parts = await expand(documentPart('gone'), {recorder: runtimeFixture()})
    expect(parts).toEqual([{type: 'text', content: '[recording expired]'}])
  })
})
