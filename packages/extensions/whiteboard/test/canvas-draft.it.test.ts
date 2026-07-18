import {expect, test} from 'vitest'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, openCanvas, readCanvas as readElements} from './canvas-it-helpers.js'

const CAT_EAR =
  "<svg viewBox='0 0 100 100'><path d='M 10 90 L 50 10 L 90 90 Z' fill='#f0a860' stroke='#7a4a1e'/><rect x='20' y='20' width='10' height='10' fill='#1e1e1e'/></svg>"

test('svg drawing lands in the draft, invisible until committed', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: CAT_EAR, x: 100, y: 100, width: 300})
    await expect.poll(() => readElements(api, 'draft'), {timeout: 30_000}).not.toHaveLength(0)
    expect(await readElements(api, 'live')).toHaveLength(0)
    const draft = await readElements(api, 'draft')
    const types = draft.map((element) => (element as {type: string}).type)
    expect(types).toContain('line')
    expect(types).toContain('rectangle')
  } finally {
    await api.dispose()
  }
})

test('rejected svg never reaches the canvas', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await expect(api.callTool('canvas.svg', {svg: '<div/>', x: 0, y: 0})).rejects.toThrow(/<svg/i)
    expect(await readElements(api, 'draft')).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

const DENSE_MANY_SUBPATHS = `<svg viewBox='0 0 100 100'><path d="${'M0 0 L5 5 '.repeat(2000)}" stroke='#000'/></svg>`

test('a pathological many-subpath svg is capped, not exploded into thousands of writes', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: DENSE_MANY_SUBPATHS, x: 0, y: 0, width: 200})
    await expect.poll(() => readElements(api, 'draft'), {timeout: 30_000}).not.toHaveLength(0)
    const draft = await readElements(api, 'draft')
    expect(draft.length).toBeLessThanOrEqual(500)
  } finally {
    await api.dispose()
  }
})

const BAD_PATH_AND_RECT =
  "<svg viewBox='0 0 100 100'><path d='M z'/><rect x='10' y='10' width='20' height='20' fill='#ccc'/></svg>"

test('one degenerate node is dropped without aborting the whole drawing', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {svg: BAD_PATH_AND_RECT, x: 0, y: 0, width: 200})
    await expect.poll(() => readElements(api, 'draft'), {timeout: 30_000}).not.toHaveLength(0)
    const types = (await readElements(api, 'draft')).map((element) => (element as {type: string}).type)
    expect(types).toContain('rectangle')
  } finally {
    await api.dispose()
  }
})
