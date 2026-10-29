import {expect, test} from 'vitest'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {until} from '@conciv/harness-testkit'
import {openCanvas, readCanvas as read, testHost} from './canvas-it-helpers.js'

const HOUSE =
  "<svg viewBox='0 0 100 100'><rect x='20' y='50' width='60' height='40' fill='#e8d9b0'/><path d='M 10 50 L 50 15 L 90 50 Z' fill='#c0533f'/></svg>"

test('commit moves the whole draft to the live canvas', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await openCanvas(api.page)
    await api.callToolApproved('canvas_svg', {svg: HOUSE, x: 60, y: 60, width: 300})
    await until(async () => (await read(api, 'draft')).length === 2, {hangGuardMs: 30_000, intervalMs: 250})
    const result = (await api.callToolApproved('canvas_commit', {})) as {committed: boolean}
    expect(result.committed).toBe(true)
    await until(async () => (await read(api, 'live')).length === 2, {hangGuardMs: 30_000, intervalMs: 250})
    expect(await read(api, 'draft')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

test('discard clears the draft and never touches live', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await openCanvas(api.page)
    await api.callToolApproved('canvas_svg', {svg: HOUSE, x: 60, y: 60, width: 300})
    await until(async () => (await read(api, 'draft')).length === 2, {hangGuardMs: 30_000, intervalMs: 250})
    const result = (await api.callToolApproved('canvas_discard', {})) as {discarded: number}
    expect(result.discarded).toBe(2)
    expect(await read(api, 'draft')).toHaveLength(0)
    expect(await read(api, 'live')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

test('commit with empty draft is a clean no-op', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await openCanvas(api.page)
    const result = (await api.callToolApproved('canvas_commit', {})) as {committed: boolean; reason?: string}
    expect(result.committed).toBe(false)
    expect(result.reason).toMatch(/no draft/i)
  } finally {
    await api.dispose()
  }
})
