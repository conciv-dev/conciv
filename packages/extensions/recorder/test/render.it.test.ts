import {afterAll, describe, expect, it} from 'vitest'
import {createChromiumRenderer, type KeyframeRenderer} from '../src/server/render.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const page = {
  id: 1,
  type: 0,
  childNodes: [
    {
      id: 2,
      type: 2,
      tagName: 'html',
      attributes: {},
      childNodes: [
        {
          id: 3,
          type: 2,
          tagName: 'body',
          attributes: {style: 'background: rgb(200, 30, 30)'},
          childNodes: [
            {id: 4, type: 2, tagName: 'h1', attributes: {}, childNodes: [{id: 5, type: 3, textContent: 'Recorded'}]},
          ],
        },
      ],
    },
  ],
}

const events: RrwebEvent[] = [
  {type: 4, data: {href: 'http://localhost/app', width: 640, height: 480}, timestamp: 1000},
  {type: 2, data: {node: page, initialOffset: {left: 0, top: 0}}, timestamp: 1001},
  {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: 2000},
]

const state: {renderer?: KeyframeRenderer | null} = {}

afterAll(async () => state.renderer?.dispose())

describe('chromium keyframe renderer (IT)', () => {
  it('renders a non-empty PNG at a requested timestamp', async () => {
    state.renderer = await createChromiumRenderer()
    if (!state.renderer)
      throw new Error('chromium unavailable on this machine — run: pnpm exec playwright install chromium')
    const frames = await state.renderer.render(events, [2000])
    expect(frames).toHaveLength(1)
    expect(frames[0]?.ts).toBe(2000)
    const png = Buffer.from(frames[0]?.pngBase64 ?? '', 'base64')
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.length).toBeGreaterThan(2000)
  }, 60_000)

  it('returns [] for a stream with no full snapshot', async () => {
    if (!state.renderer) throw new Error('renderer missing')
    const frames = await state.renderer.render([{type: 3, data: {}, timestamp: 1}], [2000])
    expect(frames).toEqual([])
  }, 60_000)
})
