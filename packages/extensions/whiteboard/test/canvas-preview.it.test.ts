import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

test('preview returns a real png of the draft without any browser round-trip', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {
      svg: "<svg viewBox='0 0 100 100'><rect x='10' y='10' width='80' height='80' fill='#f0a860'/></svg>",
      x: 50,
      y: 50,
      width: 200,
    })
    await expect
      .poll(async () => ((await api.callTool('canvas.read', {scope: 'draft'})) as {elements: unknown[]}).elements, {
        timeout: 15_000,
      })
      .toHaveLength(1)
    const result = (await api.callTool('canvas.preview', {})) as Array<{
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

test('preview on an empty draft names the cause', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    const result = (await api.callTool('canvas.preview', {})) as {empty: boolean; reason: string}
    expect(result.empty).toBe(true)
    expect(result.reason).toMatch(/no elements/i)
  } finally {
    await api.dispose()
  }
})
