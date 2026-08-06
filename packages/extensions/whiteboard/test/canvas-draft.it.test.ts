import {expect, test} from 'vitest'
import {z} from 'zod'
import whiteboard from '../src/server.js'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import {until} from '@conciv/harness-testkit'
import {openCanvas, testHost} from './canvas-it-helpers.js'

const CAT_EAR =
  "<svg viewBox='0 0 100 100'><path d='M 10 90 L 50 10 L 90 90 Z' fill='#f0a860' stroke='#7a4a1e'/><rect x='20' y='20' width='10' height='10' fill='#1e1e1e'/></svg>"

const readTypes = async (api: ExtensionTestApi, scope: string): Promise<string[]> =>
  z.array(z.string()).parse(
    await api.runTypescript(`
      const found = await external_catalog({name: 'canvas.read'})
      const reply = await globalThis[found.call]({scope: ${JSON.stringify(scope)}})
      return reply.elements.map((element) => element.type)
    `),
  )

test('svg drawing lands in the draft, invisible until committed', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await openCanvas(api.page)
    await api.callToolApproved('canvas.svg', {svg: CAT_EAR, x: 100, y: 100, width: 300})
    await until(async () => (await readTypes(api, 'draft')).length > 0, {hangGuardMs: 30_000, intervalMs: 250})
    expect(await readTypes(api, 'live')).toHaveLength(0)
    const types = await readTypes(api, 'draft')
    expect(types).toContain('line')
    expect(types).toContain('rectangle')
  } finally {
    await api.dispose()
  }
})

test('rejected svg never reaches the canvas', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await openCanvas(api.page)
    await expect(api.callToolApproved('canvas.svg', {svg: '<div/>', x: 0, y: 0})).rejects.toThrow(/<svg/i)
    expect(await readTypes(api, 'draft')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

const DENSE_MANY_SUBPATHS = `<svg viewBox='0 0 100 100'><path d="${'M0 0 L5 5 '.repeat(2000)}" stroke='#000'/></svg>`

test('a pathological many-subpath svg is capped, not exploded into thousands of writes', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await openCanvas(api.page)
    await api.callToolApproved('canvas.svg', {svg: DENSE_MANY_SUBPATHS, x: 0, y: 0, width: 200})
    await until(async () => (await readTypes(api, 'draft')).length > 0, {hangGuardMs: 30_000, intervalMs: 250})
    const types = await readTypes(api, 'draft')
    expect(types.length).toBeLessThanOrEqual(500)
  } finally {
    await api.dispose()
  }
})

const BAD_PATH_AND_RECT =
  "<svg viewBox='0 0 100 100'><path d='M z'/><rect x='10' y='10' width='20' height='20' fill='#ccc'/></svg>"

test('one degenerate node is dropped without aborting the whole drawing', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await openCanvas(api.page)
    await api.callToolApproved('canvas.svg', {svg: BAD_PATH_AND_RECT, x: 0, y: 0, width: 200})
    await until(async () => (await readTypes(api, 'draft')).length > 0, {hangGuardMs: 30_000, intervalMs: 250})
    expect(await readTypes(api, 'draft')).toContain('rectangle')
  } finally {
    await api.dispose()
  }
})
