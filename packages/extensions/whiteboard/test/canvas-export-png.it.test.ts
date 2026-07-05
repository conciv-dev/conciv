import {expect, test} from 'vitest'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, openCanvas} from './canvas-it-helpers.js'

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

test('png export round-trips through the island with excalidraw rendering', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {
      svg: "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='#f0a860'/></svg>",
      x: 100,
      y: 100,
      width: 200,
    })
    await expect
      .poll(async () => ((await api.callTool('canvas.read', {scope: 'draft'})) as {elements: unknown[]}).elements, {
        timeout: 15_000,
      })
      .toHaveLength(1)
    const result = (await api.callTool('canvas.export', {format: 'png', scope: 'draft'})) as Array<{
      type: string
      source?: {value: string; mimeType: string}
    }>
    const image = result.find((part) => part.type === 'image')
    expect(image?.source?.mimeType).toBe('image/png')
    const header = [...Buffer.from(image?.source?.value ?? '', 'base64').subarray(0, 8)]
    expect(header).toEqual(PNG_MAGIC)
  } finally {
    await api.dispose()
  }
})

test('json export still returns elements', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const result = (await api.callTool('canvas.export', {})) as {elements: unknown[]}
    expect(Array.isArray(result.elements)).toBe(true)
  } finally {
    await api.dispose()
  }
})
