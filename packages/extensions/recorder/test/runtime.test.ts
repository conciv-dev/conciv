import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {pullWindow, renderRecording} from '../src/server/runtime.js'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import {createRecordingStore} from '../src/server/recordings.js'
import type {RrwebEvent} from '../src/shared/protocol.js'
import {buttonFixture, pageFixture} from './fixtures/page.js'
import {runtimeFixture} from './helpers/runtime-fixture.js'

const page = pageFixture([buttonFixture(4, 5, 'Old'), buttonFixture(6, 7, 'New')])

const click = (ts: number, id: number): RrwebEvent => ({type: 3, data: {source: 2, type: 2, id}, timestamp: ts})

describe('pullWindow', () => {
  it('keeps pre-window events for replay context but clips the action log to the window', async () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [{type: 2, data: {node: page}, timestamp: 1000}, click(2000, 4), click(9000, 6)])
    const control = createCaptureControl(ring, () => 0)
    const result = await pullWindow(
      {
        ring,
        control,
        config: {masking: 'none', windowMinutes: 10, console: true},
        renderer: async () => null,
        recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
      },
      8000,
      10_000,
      0,
    )
    const text = JSON.stringify(result)
    expect(text).toContain('New')
    expect(text).not.toContain('Old')
  })
})

describe('renderRecording', () => {
  it('returns a text log part when no renderer is available', async () => {
    const parts = await renderRecording(runtimeFixture(), [{type: 4, data: {href: 'https://x'}, timestamp: 1}], 0)
    expect(parts.some((part) => part.type === 'text')).toBe(true)
    expect(parts.some((part) => part.type === 'image')).toBe(false)
  })
})
