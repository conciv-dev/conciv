import {describe, expect, it} from 'vitest'
import {pullWindow} from '../src/server/runtime.js'
import {createEventRing} from '../src/server/ring.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import type {RrwebEvent} from '../src/shared/protocol.js'
import {buttonFixture, pageFixture} from './fixtures/page.js'

const page = pageFixture([buttonFixture(4, 5, 'Old'), buttonFixture(6, 7, 'New')])

const click = (ts: number, id: number): RrwebEvent => ({type: 3, data: {source: 2, type: 2, id}, timestamp: ts})

describe('pullWindow', () => {
  it('keeps pre-window events for replay context but clips the action log to the window', async () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [{type: 2, data: {node: page}, timestamp: 1000}, click(2000, 4), click(9000, 6)])
    const control = createCaptureControl(ring, () => 0)
    const result = await pullWindow(
      {ring, control, config: {masking: 'none', windowMinutes: 10, console: true}, renderer: async () => null},
      8000,
      10_000,
      0,
    )
    const text = JSON.stringify(result)
    expect(text).toContain('New')
    expect(text).not.toContain('Old')
  })
})
