import {expect, test} from 'vitest'
import type {Store} from '../src/server/db/store.js'
import whiteboard from '../src/server.js'
import {autoCommitDraft} from '../src/server/auto-commit.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {clientEntry, openCanvas, readCanvas as read} from './canvas-it-helpers.js'

test('turn end commits an abandoned draft', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    await api.callTool('canvas.svg', {
      svg: "<svg viewBox='0 0 10 10'><rect x='1' y='1' width='8' height='8' fill='#ccc'/></svg>",
      x: 0,
      y: 0,
      width: 100,
    })
    await expect.poll(() => read(api, 'draft'), {timeout: 15_000}).toHaveLength(1)
    const context = api.serverContext as {store: Store}
    const committed = await autoCommitDraft(context.store, api.session)
    expect(committed).toBe(true)
    await expect.poll(() => read(api, 'live'), {timeout: 15_000}).toHaveLength(1)
    await expect.poll(() => read(api, 'draft'), {timeout: 15_000}).toHaveLength(0)
  } finally {
    await api.dispose()
  }
})

test('turn end with no draft is a no-op', async () => {
  const api = await getExtensionTestApi({server: whiteboard, clientEntry})
  try {
    await openCanvas(api.page)
    const context = api.serverContext as {store: Store}
    expect(await autoCommitDraft(context.store, api.session)).toBe(false)
  } finally {
    await api.dispose()
  }
})
