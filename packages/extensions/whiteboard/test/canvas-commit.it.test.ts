import {expect, test} from 'vitest'
import type {Page} from 'playwright'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'

const clientEntry = '@conciv/extension-whiteboard/client'

const openCanvas = async (page: Page): Promise<void> => {
  await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await page.getByRole('radio', {name: 'Rectangle'}).waitFor()
}

const HOUSE =
  "<svg viewBox='0 0 100 100'><rect x='20' y='50' width='60' height='40' fill='#e8d9b0'/><path d='M 10 50 L 50 15 L 90 50 Z' fill='#c0533f'/></svg>"

const read = async (api: {callTool: (name: string, input: unknown) => Promise<unknown>}, scope: string): Promise<unknown[]> =>
  ((await api.callTool('canvas.read', {scope})) as {elements: unknown[]}).elements

test('commit moves the whole draft to the live canvas', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: HOUSE, x: 60, y: 60, width: 300})
    await expect.poll(() => read(api, 'draft'), {timeout: 15_000}).toHaveLength(2)
    const result = (await api.callTool('canvas.commit', {})) as {committed: boolean}
    expect(result.committed).toBe(true)
    await expect.poll(() => read(api, 'live'), {timeout: 15_000}).toHaveLength(2)
    expect(await read(api, 'draft')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

test('discard clears the draft and never touches live', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: HOUSE, x: 60, y: 60, width: 300})
    await expect.poll(() => read(api, 'draft'), {timeout: 15_000}).toHaveLength(2)
    const result = (await api.callTool('canvas.discard', {})) as {discarded: number}
    expect(result.discarded).toBe(2)
    expect(await read(api, 'draft')).toHaveLength(0)
    expect(await read(api, 'live')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

test('commit with empty draft is a clean no-op', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const result = (await api.callTool('canvas.commit', {})) as {committed: boolean; reason?: string}
    expect(result.committed).toBe(false)
    expect(result.reason).toMatch(/no draft/i)
  } finally {
    await api.dispose()
  }
})
