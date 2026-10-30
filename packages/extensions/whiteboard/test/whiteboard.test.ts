import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createORPCClient, safe} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import type {RouterClient} from '@orpc/server'
import {eq} from 'drizzle-orm'
import type {Locator, Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'
import {afterAll, afterEach, beforeAll, describe, expect, it, test} from 'vitest'
import {z} from 'zod'
import {getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import {rpcCallCursor, type RpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {until} from '@conciv/harness-testkit'
import {serveExtensionRpc, type ServedRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import {rpcOverWebsocket} from '@conciv/harness-testkit/rpc-websocket-client'
import {CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'
import whiteboard from '../src/server.js'
import {autoCommitDraft} from '../src/server/auto-commit.js'
import {comments} from '../src/server/db/schema.js'
import {createStore, type Store, type WhiteboardEvent} from '../src/server/db/store.js'
import {makeWhiteboardRouter, type WhiteboardRouter} from '../src/server/router.js'
import {
  bootWhiteboard,
  ELEMENT_WRITE_THROTTLE_MS,
  createFloatingComment,
  openCanvas,
  openThreadPin,
  readCanvas,
  readCanvas as read,
  testHost,
} from './canvas-it-helpers.js'

describe('canvas autocommit', () => {
  test('turn end commits an abandoned draft', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await api.callToolApproved('canvas_svg', {
        svg: "<svg viewBox='0 0 10 10'><rect x='1' y='1' width='8' height='8' fill='#ccc'/></svg>",
        x: 0,
        y: 0,
        width: 100,
      })
      await until(async () => (await read(api, 'draft')).length === 1, {hangGuardMs: 30_000, intervalMs: 250})
      const context = api.serverContext as {store: Store}
      const committed = await autoCommitDraft(context.store, api.session)
      expect(committed).toBe(true)
      await until(async () => (await read(api, 'live')).length === 1, {hangGuardMs: 30_000, intervalMs: 250})
      await until(async () => (await read(api, 'draft')).length === 0, {hangGuardMs: 30_000, intervalMs: 250})
    } finally {
      await api.dispose()
    }
  })

  test('turn end with no draft is a no-op', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      const context = api.serverContext as {store: Store}
      expect(await autoCommitDraft(context.store, api.session)).toBe(false)
    } finally {
      await api.dispose()
    }
  })
})

describe('canvas commit', () => {
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
})

describe('canvas draft', () => {
  const CAT_EAR =
    "<svg viewBox='0 0 100 100'><path d='M 10 90 L 50 10 L 90 90 Z' fill='#f0a860' stroke='#7a4a1e'/><rect x='20' y='20' width='10' height='10' fill='#1e1e1e'/></svg>"

  const readTypes = async (api: ExtensionTestApi, scope: string): Promise<string[]> =>
    z.array(z.string()).parse(
      await api.runTypescript(`
      const found = await external_catalog({name: 'canvas_read'})
      const reply = await globalThis[found.call]({scope: ${JSON.stringify(scope)}})
      return reply.elements.map((element) => element.type)
    `),
    )

  test('svg drawing lands in the draft, invisible until committed', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await api.callToolApproved('canvas_svg', {svg: CAT_EAR, x: 100, y: 100, width: 300})
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
      await expect(api.callToolApproved('canvas_svg', {svg: '<div/>', x: 0, y: 0})).rejects.toThrow(/<svg/i)
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
      await api.callToolApproved('canvas_svg', {svg: DENSE_MANY_SUBPATHS, x: 0, y: 0, width: 200})
      await until(async () => (await readTypes(api, 'draft')).length > 0, {hangGuardMs: 30_000, intervalMs: 250})
      const types = await readTypes(api, 'draft')
      expect(types.length).toBeLessThanOrEqual(500)
    } finally {
      await api.dispose()
    }
  }, 120000)

  const BAD_PATH_AND_RECT =
    "<svg viewBox='0 0 100 100'><path d='M z'/><rect x='10' y='10' width='20' height='20' fill='#ccc'/></svg>"

  test('one degenerate node is dropped without aborting the whole drawing', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await api.callToolApproved('canvas_svg', {svg: BAD_PATH_AND_RECT, x: 0, y: 0, width: 200})
      await until(async () => (await readTypes(api, 'draft')).length > 0, {hangGuardMs: 30_000, intervalMs: 250})
      expect(await readTypes(api, 'draft')).toContain('rectangle')
    } finally {
      await api.dispose()
    }
  })
})

describe('canvas drag batching', () => {
  const flushBudget = (elapsedMs: number): number => Math.ceil(elapsedMs / ELEMENT_WRITE_THROTTLE_MS) + 2

  type CanvasElement = {x: number; width: number; height: number}
  const readElements = async (api: ExtensionTestApi): Promise<CanvasElement[]> =>
    ((await api.callTool('canvas_read', {})) as {elements: CanvasElement[]}).elements

  const readXs = async (api: ExtensionTestApi): Promise<number[]> =>
    (await readElements(api)).map((element) => element.x).sort((left, right) => left - right)

  const drawRectangle = async (page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> => {
    await page.getByRole('radio', {name: 'Rectangle'}).click({force: true})
    await page.mouse.move(x1, y1)
    await page.mouse.down()
    await page.mouse.move(x2, y2, {steps: 10})
    await page.mouse.up()
  }

  const UPSERT_PATH = ['ext', 'whiteboard', 'elements', 'upsert']
  const BULK_UPSERT_PATH = ['ext', 'whiteboard', 'elements', 'bulkUpsert']

  const putCounts = (calls: RpcCallCursor): {single: number; bulk: number} => ({
    single: calls.startedSince(UPSERT_PATH),
    bulk: calls.startedSince(BULK_UPSERT_PATH),
  })

  const dragBursts = async (page: Page, fromX: number, y: number, dx: number): Promise<void> => {
    await page.mouse.move(fromX, y)
    await page.mouse.down()
    await page.mouse.move(fromX + 6 * dx, y, {steps: 90})
    await page.mouse.up()
  }

  test('a single-element drag coalesces per-frame writes into few throttled PUTs', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const {cx, cy} = await openCanvas(api.page)
      await drawRectangle(api.page, cx - 120, cy - 80, cx + 120, cy + 80)
      await until(async () => ((await readElements(api))[0]?.width ?? 0) > 100, {hangGuardMs: 30_000, intervalMs: 250})
      const startX = (await readElements(api))[0]?.x ?? 0
      await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
      const calls = rpcCallCursor(api.page)
      const dragStartedAt = Date.now()
      await dragBursts(api.page, cx, cy, 40)
      await until(async () => ((await readElements(api))[0]?.x ?? startX) - startX > 180, {
        hangGuardMs: 30_000,
        intervalMs: 250,
      })
      const counts = putCounts(calls)
      expect(counts.single).toBeGreaterThan(1)
      expect(counts.single).toBeLessThanOrEqual(flushBudget(Date.now() - dragStartedAt))
      expect(counts.bulk).toBe(0)
    } finally {
      await api.dispose()
    }
  })

  test('a multi-select drag collapses to bulk PUTs, not a single-PUT storm', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const {cx, cy} = await openCanvas(api.page)
      await drawRectangle(api.page, cx - 220, cy - 40, cx - 120, cy + 40)
      await drawRectangle(api.page, cx + 120, cy - 40, cx + 220, cy + 40)
      await until(async () => (await readElements(api)).length === 2, {hangGuardMs: 30_000, intervalMs: 250})
      const startXs = await readXs(api)
      await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
      await api.page.mouse.move(cx - 300, cy - 120)
      await api.page.mouse.down()
      await api.page.mouse.move(cx + 300, cy + 140, {steps: 10})
      await api.page.mouse.up()
      const calls = rpcCallCursor(api.page)
      const dragStartedAt = Date.now()
      await dragBursts(api.page, cx - 170, cy, 26)
      await until(
        async () => {
          const [x0, x1] = await readXs(api)
          const [s0, s1] = startXs
          if (x0 === undefined || x1 === undefined || s0 === undefined || s1 === undefined) return false
          return x0 - s0 > 100 && x1 - s1 > 100
        },
        {hangGuardMs: 30_000, intervalMs: 250},
      )
      const counts = putCounts(calls)
      expect(counts.bulk).toBeGreaterThan(0)
      expect(counts.single + counts.bulk).toBeLessThanOrEqual(flushBudget(Date.now() - dragStartedAt))
    } finally {
      await api.dispose()
    }
  })
})

describe('canvas drag', () => {
  type CanvasElement = {x: number; width: number; height: number}
  const readElements = async (api: ExtensionTestApi): Promise<CanvasElement[]> =>
    ((await api.callTool('canvas_read', {})) as {elements: CanvasElement[]}).elements

  const firstWidth = async (api: ExtensionTestApi): Promise<number> => (await readElements(api))[0]?.width ?? 0
  const firstDeltaX = async (api: ExtensionTestApi, fromX: number): Promise<number> =>
    ((await readElements(api))[0]?.x ?? fromX) - fromX

  const drawRectangle = async (page: Page, cx: number, cy: number): Promise<void> => {
    await page.getByRole('radio', {name: 'Rectangle'}).click({force: true})
    await page.mouse.move(cx - 120, cy - 80)
    await page.mouse.down()
    await page.mouse.move(cx + 120, cy + 80, {steps: 14})
    await page.mouse.up()
  }

  test('a drawn rectangle keeps its real size and does not collapse to a point', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const {cx, cy} = await openCanvas(api.page)
      await drawRectangle(api.page, cx, cy)
      await until(async () => (await firstWidth(api)) > 100, {hangGuardMs: 30_000, intervalMs: 250})
      const settled = (await readElements(api))[0]
      expect(settled?.height).toBeGreaterThan(60)
      await until(async () => ((await readElements(api))[0]?.width ?? 0) >= (settled?.width ?? 0) * 0.9, {
        settleFor: 2000,
        hangGuardMs: 8000,
        intervalMs: 250,
      })
    } finally {
      await api.dispose()
    }
  })

  test('dragging a rectangle moves it the full cursor distance, not a fraction', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const {cx, cy} = await openCanvas(api.page)
      await drawRectangle(api.page, cx, cy)
      await until(async () => (await firstWidth(api)) > 100, {hangGuardMs: 30_000, intervalMs: 250})
      const startX = (await readElements(api))[0]?.x ?? 0
      await api.page.getByRole('radio', {name: 'Selection'}).click({force: true})
      await api.page.mouse.move(cx, cy)
      await api.page.mouse.down()
      for (let step = 1; step <= 10; step += 1) await api.page.mouse.move(cx + step * 20, cy, {steps: 1})
      await api.page.mouse.up()
      await until(async () => (await firstDeltaX(api, startX)) > 180, {hangGuardMs: 30_000, intervalMs: 250})
    } finally {
      await api.dispose()
    }
  })
})

describe('canvas export png', () => {
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

  test('png export round-trips through the island with excalidraw rendering', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await api.callToolApproved('canvas_svg', {
        svg: "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='#f0a860'/></svg>",
        x: 100,
        y: 100,
        width: 200,
      })
      await until(async () => (await readCanvas(api, 'draft')).length === 1, {hangGuardMs: 30_000, intervalMs: 250})
      const result = (await api.callTool('canvas_export', {format: 'png', scope: 'draft'})) as Array<{
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
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      const result = (await api.callTool('canvas_export', {})) as {elements: unknown[]}
      expect(Array.isArray(result.elements)).toBe(true)
    } finally {
      await api.dispose()
    }
  })
})

describe('canvas preview', () => {
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

  test('preview returns a real png of the draft without any browser round-trip', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await api.callToolApproved('canvas_svg', {
        svg: "<svg viewBox='0 0 100 100'><rect x='10' y='10' width='80' height='80' fill='#f0a860'/></svg>",
        x: 50,
        y: 50,
        width: 200,
      })
      await until(async () => (await readCanvas(api, 'draft')).length === 1, {hangGuardMs: 30_000, intervalMs: 250})
      const result = (await api.callTool('canvas_preview', {})) as Array<{
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
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const result = (await api.callTool('canvas_preview', {})) as {empty: boolean; reason: string}
      expect(result.empty).toBe(true)
      expect(result.reason).toMatch(/no elements/i)
    } finally {
      await api.dispose()
    }
  })
})

describe('canvas quiescent', () => {
  test('moving over the open canvas does not storm the sync feed (no write feedback loop)', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const {cx, cy} = await openCanvas(api.page)

      await api.callToolApproved('comment_create', {
        cid: crypto.randomUUID(),
        kind: 'floating',
        parts: [{type: 'text', text: 'quiescence probe'}],
        x: 240,
        y: 240,
        authorKind: 'ai',
        authorModel: 'Opus',
      })
      await api.page.getByRole('button', {name: /comment, open/}).waitFor({timeout: 30_000})
      await api.page.waitForTimeout(1500)

      const cdp = await api.page.context().newCDPSession(api.page)
      await cdp.send('Network.enable')
      let framesSent = 0
      cdp.on('Network.webSocketFrameSent', () => (framesSent += 1))

      for (let step = 0; step < 24; step += 1) {
        await api.page.mouse.move(cx - 120 + step * 10, cy + (step % 2 === 0 ? -8 : 8))
        await api.page.waitForTimeout(80)
      }

      expect(framesSent).toBeLessThan(8)
    } finally {
      await api.dispose()
    }
  })
})

describe('compose canvas restore', () => {
  const canvasToolbar = (page: Page) => page.getByRole('radio', {name: 'Rectangle'})

  const pickAndCompose = async (page: Page, text: string): Promise<void> => {
    await page.getByRole('button', {name: 'Comment on an element'}).evaluate((element: HTMLElement) => element.click())
    await page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())
    const field = page.getByRole('textbox', {name: 'Comment'})
    await field.waitFor({timeout: 30_000})
    await field.focus()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }

  test('picking hides an open canvas and adding the comment restores it', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await api.page
        .getByRole('button', {name: 'Comment on an element'})
        .evaluate((element: HTMLElement) => element.click())
      await expectLocator(canvasToolbar(api.page)).toBeHidden()

      await api.page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())
      const field = api.page.getByRole('textbox', {name: 'Comment'})
      await field.waitFor({timeout: 30_000})
      await expectLocator(canvasToolbar(api.page)).toBeHidden()

      await field.focus()
      await api.page.keyboard.type('note over the page')
      await api.page.keyboard.press('Enter')

      await expectLocator(canvasToolbar(api.page)).toBeVisible({timeout: 30_000})
      await api.page.getByText('note over the page').waitFor({timeout: 30_000})
    } finally {
      await api.dispose()
    }
  })

  test('a comment picked while the canvas is closed leaves it closed and toasts', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await pickAndCompose(api.page, 'silent note')
      await api.page.getByText('Comment added to the whiteboard').waitFor({timeout: 30_000})
      await expectLocator(canvasToolbar(api.page)).toBeHidden()
      await expectLocator(api.page.getByText('silent note')).toBeHidden()
    } finally {
      await api.dispose()
    }
  })

  test('cancelling the compose restores the canvas', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await api.page
        .getByRole('button', {name: 'Comment on an element'})
        .evaluate((element: HTMLElement) => element.click())
      await api.page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())
      const field = api.page.getByRole('textbox', {name: 'Comment'})
      await field.waitFor({timeout: 30_000})
      await expectLocator(canvasToolbar(api.page)).toBeHidden()

      await api.page.getByRole('button', {name: 'Cancel comment'}).evaluate((element: HTMLElement) => element.click())
      await expectLocator(canvasToolbar(api.page)).toBeVisible({timeout: 30_000})
    } finally {
      await api.dispose()
    }
  })
})

describe('inbox edges', () => {
  const openInbox = async (page: Page): Promise<void> => {
    const toggle = page.getByRole('button', {name: 'Toggle comments inbox'})
    await toggle.focus()
    await toggle.press('Enter')
  }

  test('the inbox shows empty, single-comment, and no-results edge states', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await openInbox(api.page)
      await api.page.getByText('No comments yet').waitFor({timeout: 30_000})

      await api.callToolApproved('comment_create', {
        cid: crypto.randomUUID(),
        kind: 'floating',
        parts: [{type: 'text', text: 'a lonely note'}],
        x: 200,
        y: 200,
        authorKind: 'ai',
        authorModel: 'Opus',
      })
      const item = api.page.getByRole('button', {name: /^Opus/})
      await item.waitFor({timeout: 30_000})
      expect((await item.innerText()).toLowerCase()).not.toContain('repl')

      const search = api.page.getByRole('textbox', {name: 'Quick search'})
      await search.focus()
      await api.page.keyboard.type('zzznomatch')
      await api.page.getByText(/No comments match/).waitFor({timeout: 30_000})
    } finally {
      await api.dispose()
    }
  })
})

describe('inbox', () => {
  const create = async (
    api: Awaited<ReturnType<typeof getExtensionTestApi>>,
    text: string,
    model: string,
  ): Promise<void> => {
    await api.callToolApproved('comment_create', {
      cid: crypto.randomUUID(),
      kind: 'floating',
      parts: [{type: 'text', text}],
      x: 200,
      y: 200,
      authorKind: 'ai',
      authorModel: model,
    })
  }

  test('the inbox lists threads, marks all read, and opens a thread', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await openCanvas(api.page)
      await create(api, 'first inbox note', 'Opus')
      await create(api, 'second inbox note', 'Sonnet')
      await api.page
        .getByRole('button', {name: /comment, open/})
        .first()
        .waitFor({timeout: 30_000})

      const toggle = api.page.getByRole('button', {name: 'Toggle comments inbox'})
      await toggle.focus()
      await toggle.press('Enter')

      await api.page.getByText('first inbox note').waitFor({timeout: 30_000})
      await api.page.getByText('second inbox note').waitFor()
      expect(await api.page.getByRole('button', {name: /unread/}).count()).toBeGreaterThan(0)

      const markAll = api.page.getByRole('button', {name: 'Mark all as read'})
      await markAll.focus()
      await markAll.press('Enter')
      await expectLocator(api.page.getByRole('button', {name: /unread/})).toHaveCount(0, {timeout: 30_000})

      const item = api.page.getByRole('button', {name: /^Opus/})
      await item.focus()
      await item.press('Enter')
      await api.page.getByRole('textbox', {name: 'Reply'}).waitFor({timeout: 30_000})
    } finally {
      await api.dispose()
    }
  })
})

describe('pin pan', () => {
  const projectedTop = (pin: Locator) => async (): Promise<number> =>
    pin.evaluate((element) => (element as HTMLElement).getBoundingClientRect().top)

  test('a comment pin is projected to screen and tracks canvas pan', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const {cx, cy} = await openCanvas(api.page)
      await api.callToolApproved('comment_create', {
        cid: crypto.randomUUID(),
        kind: 'floating',
        parts: [{type: 'text', text: 'pan test'}],
        x: 240,
        y: 240,
        authorKind: 'ai',
      })

      const pin = api.page.getByRole('button', {name: /comment, open/})
      await pin.waitFor({timeout: 30_000})
      const top0 = await projectedTop(pin)()
      expect(top0).toBeGreaterThan(0)

      await api.page.mouse.move(cx, cy)
      await api.page.mouse.wheel(0, 320)

      await until(async () => Math.abs((await projectedTop(pin)()) - top0) > 80, {hangGuardMs: 30_000, intervalMs: 250})
    } finally {
      await api.dispose()
    }
  })
})

describe('router', () => {
  const ROOM_R1 = SessionId.parse('conciv_r1')
  const ROOM_SESS_A = SessionId.parse('conciv_sess_a')
  const ROOM_SESS_B = SessionId.parse('conciv_sess_b')
  const ROOM_SSE = SessionId.parse('conciv_sse_room')
  const ROOM_OTHER = SessionId.parse('conciv_other_room')
  const ROOM_WS = SessionId.parse('conciv_ws_room')
  const ROOM_WS_STREAM = SessionId.parse('conciv_ws_stream')
  const ROOM_CUR = SessionId.parse('conciv_cur_room')
  const ROOM_BULK = SessionId.parse('conciv_bulk_room')
  const ROOM_VICTIM = SessionId.parse('conciv_victim_room')
  const ROOM_ATTACKER = SessionId.parse('conciv_attacker_room')

  type Client = RouterClient<WhiteboardRouter>

  let store: Store
  let served: ServedRpcRouter
  let client: Client
  let attacker: Client

  const clientFor = (room: SessionId | null): Client =>
    createORPCClient(
      new RPCLink({
        url: served.rpcUrl,
        headers: () => (room === null ? {} : {[CONCIV_SESSION_HEADER]: room}),
      }),
    )

  const pinIn = (room: SessionId, cid: string) => ({
    id: crypto.randomUUID(),
    room,
    cid,
    x: 1,
    y: 2,
    elementId: null,
    pinState: 'locked' as const,
    anchorX: null,
    anchorY: null,
  })

  const withoutRoom = <T extends {room: unknown}>({room, ...rest}: T): Omit<T, 'room'> => {
    void room
    return rest
  }

  const withoutSessionId = <T extends {sessionId: unknown}>({sessionId, ...rest}: T): Omit<T, 'sessionId'> => {
    void sessionId
    return rest
  }

  beforeAll(async () => {
    store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-router-'))))
    served = await serveExtensionRpc({slug: 'whiteboard', router: makeWhiteboardRouter(store)})
    client = clientFor(ROOM_R1)
    attacker = clientFor(ROOM_ATTACKER)
  })
  afterAll(async () => {
    await served.close()
    store.close()
  })

  describe('whiteboard router', () => {
    it('round-trips a pin through insert/list/update/remove', async () => {
      const pin = pinIn(ROOM_R1, 'c1')
      expect(await client.pins.insert(withoutRoom(pin))).toEqual(pin)
      expect(await client.pins.list()).toEqual([pin])
      const moved = await client.pins.update({id: pin.id, patch: {x: 9}})
      expect(moved.x).toBe(9)
      expect(await client.pins.remove({id: pin.id})).toEqual({deleted: true})
    })

    it('scopes comments by the session the caller carries', async () => {
      const comment = {
        id: crypto.randomUUID(),
        sessionId: ROOM_SESS_A,
        cid: 'cc1',
        threadId: 'cc1',
        parentId: null,
        parts: [{type: 'text', text: 'hi'}],
        authorKind: 'human' as const,
        authorModel: null,
        authorId: null,
        authorName: null,
        authorAvatar: null,
        status: 'open' as const,
        kind: 'floating' as const,
        anchor: null,
        anchorFile: null,
        anchorComponent: null,
        anchorHash: null,
        createdAt: 1000,
        updatedAt: 1000,
        resolvedAt: null,
      }
      await clientFor(ROOM_SESS_A).comments.insert(withoutSessionId(comment))
      expect(await clientFor(ROOM_SESS_A).comments.list()).toHaveLength(1)
      expect(await clientFor(ROOM_SESS_B).comments.list()).toHaveLength(0)
    })

    it('element upsert reports a typed CONFLICT carrying the winner on stale version', async () => {
      const rowIn = {elementId: 'e1', data: {type: 'rectangle'}, version: 2}
      expect(await client.elements.upsert({scope: 'live', row: rowIn})).toEqual({...rowIn, room: ROOM_R1})
      const {error, isDefined} = await safe(client.elements.upsert({scope: 'live', row: {...rowIn, version: 1}}))
      if (!isDefined || error.code !== 'CONFLICT') throw new Error('expected a typed CONFLICT')
      expect(error.data.current.version).toBe(2)
      expect(await client.elements.list({scope: 'live'})).toHaveLength(1)
    })

    it('bulk upsert echoes the authoritative row per input, winner on conflict', async () => {
      const bulk = clientFor(ROOM_BULK)
      await bulk.elements.upsert({scope: 'live', row: {elementId: 'b1', data: {v: 1}, version: 5}})
      const {rows} = await bulk.elements.bulkUpsert({
        scope: 'live',
        rows: [
          {elementId: 'b1', data: {v: 2}, version: 3},
          {elementId: 'b2', data: {v: 9}, version: 1},
        ],
      })
      expect(rows).toHaveLength(2)
      expect(rows[0]).toEqual({room: ROOM_BULK, elementId: 'b1', data: {v: 1}, version: 5})
      expect(rows[1]).toEqual({room: ROOM_BULK, elementId: 'b2', data: {v: 9}, version: 1})
    })

    it('rejects an invalid input at the wire', async () => {
      const post = (path: string, body: unknown): Promise<Response> =>
        fetch(`${served.base}/rpc/ext/whiteboard/${path}`, {
          method: 'POST',
          headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: ROOM_R1},
          body: JSON.stringify({json: body}),
        })
      expect((await post('elements/upsert', {scope: 'live', row: {elementId: 'e1'}})).ok).toBe(false)
      expect((await post('pins/insert', {id: 'x'})).ok).toBe(false)
    })

    it('refuses a room-scoped call that carries no session header', async () => {
      const anonymous = clientFor(null)
      const {error, isDefined} = await safe(anonymous.pins.list())
      expect(isDefined).toBe(false)
      expect(error).toBeInstanceOf(Error)
    })

    it('never lets another session update a row it does not own', async () => {
      const pin = pinIn(ROOM_VICTIM, 'victim-pin')
      const victim = clientFor(ROOM_VICTIM)
      await victim.pins.insert(withoutRoom(pin))
      const {error} = await safe(attacker.pins.update({id: pin.id, patch: {x: 999}}))
      expect(error).toBeInstanceOf(Error)
      expect(await victim.pins.list()).toEqual([pin])
      expect(await attacker.pins.list()).toEqual([])
    })

    it('an insert always lands in the caller own room, even if the caller tries to smuggle in a foreign one', async () => {
      const post = (body: unknown): Promise<Response> =>
        fetch(`${served.base}/rpc/ext/whiteboard/pins/insert`, {
          method: 'POST',
          headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: ROOM_ATTACKER},
          body: JSON.stringify({json: body}),
        })
      const smuggled = {...pinIn(ROOM_VICTIM, 'planted-pin'), room: ROOM_VICTIM}
      const response = await post(smuggled)
      expect(response.ok).toBe(true)
      expect((await clientFor(ROOM_VICTIM).pins.list()).map((row) => row.cid)).not.toContain('planted-pin')
      expect((await attacker.pins.list()).map((row) => row.cid)).toContain('planted-pin')
    })

    it('an update patch cannot smuggle the row into another room or rewrite its identifier', async () => {
      const postUpdate = (body: unknown): Promise<Response> =>
        fetch(`${served.base}/rpc/ext/whiteboard/pins/update`, {
          method: 'POST',
          headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: ROOM_ATTACKER},
          body: JSON.stringify({json: body}),
        })
      const pin = pinIn(ROOM_ATTACKER, 'ownership-pin')
      await attacker.pins.insert(withoutRoom(pin))

      await postUpdate({id: pin.id, patch: {x: 42, room: ROOM_VICTIM, id: 'rewritten-id'}})

      expect((await clientFor(ROOM_VICTIM).pins.list()).map((row) => row.cid)).not.toContain('ownership-pin')
      const mine = await attacker.pins.list()
      expect(mine.map((row) => row.cid)).toContain('ownership-pin')
      expect(mine.find((row) => row.cid === 'ownership-pin')).toMatchObject({id: pin.id, room: ROOM_ATTACKER, x: 42})
      await attacker.pins.remove({id: pin.id})
    })

    it('an element upsert from another session never lands in the target room', async () => {
      const victim = clientFor(ROOM_VICTIM)
      const mine = {elementId: 'shared', data: {v: 'mine'}, version: 1}
      await victim.elements.upsert({scope: 'live', row: mine})
      await attacker.elements.upsert({scope: 'live', row: {elementId: 'shared', data: {v: 'theirs'}, version: 9}})
      await attacker.elements.bulkUpsert({
        scope: 'live',
        rows: [{elementId: 'planted', data: {v: 'theirs'}, version: 1}],
      })
      expect(await victim.elements.list({scope: 'live'})).toEqual([{...mine, room: ROOM_VICTIM}])
      expect((await attacker.elements.list({scope: 'live'})).map((row) => row.elementId).toSorted()).toEqual([
        'planted',
        'shared',
      ])
    })

    it('streams typed change events for writes in the room only', async () => {
      const abort = new AbortController()
      const sse = clientFor(ROOM_SSE)
      const changes = await sse.changes(undefined, {signal: abort.signal})
      await new Promise((resolve) => setTimeout(resolve, 50))
      await store.insertPin({id: crypto.randomUUID(), room: ROOM_OTHER, cid: 'cx', x: 0, y: 0})
      await store.insertPin({id: crypto.randomUUID(), room: ROOM_SSE, cid: 'c2', x: 5, y: 6})
      const first = await changes.next()
      abort.abort()
      if (first.done) throw new Error('changes ended before an event arrived')
      expect(first.value.table).toBe('pins')
      expect(JSON.stringify(first.value)).toContain('"cid":"c2"')
      await changes.return(undefined).catch(() => {})
    })

    it('answers the same procedures over the websocket mount under ext.whiteboard', async () => {
      const socket = new WebSocket(served.wsUrl)
      const wsClient = rpcOverWebsocket<RouterClient<WhiteboardRouter>>(socket, {
        path: ['ext', 'whiteboard'],
        session: ROOM_WS,
      })
      const pin = pinIn(ROOM_WS, 'cws')
      expect(await wsClient.pins.insert(withoutRoom(pin))).toEqual(pin)
      expect(await clientFor(ROOM_WS).pins.list()).toEqual([pin])
      socket.close()
    })

    it('streams typed change events over the websocket mount', async () => {
      const socket = new WebSocket(served.wsUrl)
      const wsClient = rpcOverWebsocket<RouterClient<WhiteboardRouter>>(socket, {
        path: ['ext', 'whiteboard'],
        session: ROOM_WS_STREAM,
      })
      const abort = new AbortController()
      const changes = await wsClient.changes(undefined, {signal: abort.signal})
      await new Promise((resolve) => setTimeout(resolve, 50))
      await store.insertPin({id: crypto.randomUUID(), room: ROOM_WS_STREAM, cid: 'cws2', x: 1, y: 1})
      const first = await changes.next()
      abort.abort()
      if (first.done) throw new Error('changes ended before an event arrived')
      expect(first.value.table).toBe('pins')
      expect(JSON.stringify(first.value)).toContain('"cid":"cws2"')
      await changes.return(undefined).catch(() => {})
      socket.close()
    })

    it('streams cursor events', async () => {
      const abort = new AbortController()
      const cursorClient = clientFor(ROOM_CUR)
      const changes = await cursorClient.changes(undefined, {signal: abort.signal})
      await new Promise((resolve) => setTimeout(resolve, 50))
      await cursorClient.cursor({
        peerId: 'p1',
        kind: 'human',
        x: 0,
        y: 0,
        name: 'G',
        color: '#fff',
        lastSeen: 1,
      })
      const first = await changes.next()
      abort.abort()
      if (first.done) throw new Error('changes ended before an event arrived')
      expect(first.value.table).toBe('cursor')
      expect(JSON.stringify(first.value)).toContain('"peerId":"p1"')
      await changes.return(undefined).catch(() => {})
    })
  })
})

describe('store', () => {
  const stores: Store[] = []
  const open = async (): Promise<Store> => {
    const store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-store-'))))
    stores.push(store)
    return store
  }
  afterEach(() => stores.splice(0).forEach((store) => store.close()))

  describe('whiteboard store', () => {
    it('inserts, updates, deletes comments and emits typed events', async () => {
      const store = await open()
      const events: WhiteboardEvent[] = []
      store.onEvent((event) => events.push(event))
      const saved = await store.insertComment({
        id: crypto.randomUUID(),
        sessionId: 's1',
        cid: 'c1',
        threadId: 'c1',
        parts: [{type: 'text', text: 'hi'}],
        authorKind: 'human',
        kind: 'floating',
        createdAt: 1000,
        updatedAt: 1000,
      })
      expect(saved.status).toBe('open')
      expect(saved.parentId).toBeNull()
      const listed = await store.db.select().from(comments).where(eq(comments.sessionId, 's1'))
      expect(listed).toHaveLength(1)
      const updated = await store.updateComment(saved.id, 's1', {status: 'resolved', resolvedAt: 2000})
      expect(updated?.status).toBe('resolved')
      expect(await store.deleteComment(saved.id, 's1')).toBe(true)
      expect(events.map((event) => event.table)).toEqual(['comments', 'comments', 'comments'])
      expect(events.map((event) => (event.table === 'cursor' ? 'cursor' : event.type))).toEqual([
        'upsert',
        'upsert',
        'delete',
      ])
    })

    it('gates element upserts by version', async () => {
      const store = await open()
      const base = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2}
      expect((await store.upsertElement('live', base)).ok).toBe(true)
      const stale = await store.upsertElement('live', {...base, version: 1, data: {type: 'ellipse'}})
      expect(stale.ok).toBe(false)
      if (!stale.ok) expect(stale.current.version).toBe(2)
      expect((await store.upsertElement('live', {...base, version: 3})).ok).toBe(true)
      expect(await store.listElements('live', 'r1')).toEqual([{...base, version: 3}])
    })

    it('bulk upsert and bulk delete cover the pending drain', async () => {
      const store = await open()
      const rows = [
        {room: 'r1', elementId: 'e1', data: {}, version: 1},
        {room: 'r1', elementId: 'e2', data: {}, version: 1},
      ]
      expect(await store.upsertElements('draft', rows)).toHaveLength(2)
      expect(await store.deleteElements('draft', 'r1', ['e1', 'e2'])).toBe(2)
      expect(await store.listElements('draft', 'r1')).toHaveLength(0)
    })

    it('bulk upsert returns the authoritative row per input, winner on conflict', async () => {
      const store = await open()
      await store.upsertElement('live', {room: 'r1', elementId: 'e1', data: {v: 1}, version: 5})
      const resolved = await store.upsertElements('live', [
        {room: 'r1', elementId: 'e1', data: {v: 2}, version: 3},
        {room: 'r1', elementId: 'e2', data: {v: 9}, version: 1},
      ])
      expect(resolved).toHaveLength(2)
      expect(resolved[0]).toEqual({room: 'r1', elementId: 'e1', data: {v: 1}, version: 5})
      expect(resolved[1]).toEqual({room: 'r1', elementId: 'e2', data: {v: 9}, version: 1})
    })

    it('broadcasts cursor events without persisting', async () => {
      const store = await open()
      const events: WhiteboardEvent[] = []
      store.onEvent((event) => events.push(event))
      store.cursor({room: 'r1', peerId: 'p1', kind: 'human', x: 1, y: 2, name: 'G', color: '#fff', lastSeen: 1000})
      expect(events).toHaveLength(1)
      expect(events[0]?.table).toBe('cursor')
    })

    it('persists across reopen from the same dataDir', async () => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wb-persist-')))
      const first = await createStore(dir)
      await first.upsertElement('live', {room: 'r1', elementId: 'e1', data: {}, version: 1})
      first.close()
      const second = await createStore(dir)
      stores.push(second)
      expect(await second.listElements('live', 'r1')).toHaveLength(1)
    })
  })
})

describe('thread anchor', () => {
  const ANCHOR_NULL = 'thread anchor is null while open'

  test('the human compose flow opens an anchored thread without a null anchor', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    const anchorWarnings: string[] = []
    api.page.on(
      'console',
      (message) =>
        message.type() === 'warning' && message.text().includes(ANCHOR_NULL) && anchorWarnings.push(message.text()),
    )
    try {
      await openCanvas(api.page)

      await api.page
        .getByRole('button', {name: 'Comment on an element'})
        .evaluate((element: HTMLElement) => element.click())
      await api.page.getByRole('button', {name: 'Comment target'}).evaluate((element: HTMLElement) => element.click())

      const field = api.page.getByRole('textbox', {name: 'Comment'})
      await field.waitFor({timeout: 30_000})
      await field.focus()
      await api.page.keyboard.type('a fresh note')
      await api.page.keyboard.press('Enter')

      const note = api.page.getByText('a fresh note')
      await note.waitFor({timeout: 30_000})
      const pin = api.page.getByRole('button', {name: /comment, open/})
      await pin.waitFor({timeout: 30_000})

      const noteBox = await note.boundingBox()
      const pinBox = await pin.boundingBox()
      expect(noteBox).not.toBeNull()
      expect(pinBox).not.toBeNull()
      expect(noteBox?.x ?? 0).toBeGreaterThanOrEqual(pinBox?.x ?? 0)
      expect(anchorWarnings).toEqual([])
    } finally {
      await api.dispose()
    }
  })
})

describe('thread card', () => {
  test('clicking a pin opens the thread card with its comment and replies', async () => {
    const api = await bootWhiteboard()
    try {
      await openCanvas(api.page)
      const cid = crypto.randomUUID()
      await createFloatingComment(api, cid, 'agent left a note', {authorModel: 'Opus'})

      const pin = api.page.getByRole('button', {name: /comment, open/})
      await pin.waitFor({timeout: 30_000})
      await pin.focus()
      await pin.press('Enter')

      await api.page.getByText('agent left a note').waitFor({timeout: 30_000})
      await api.page.getByText('Opus').waitFor()

      const reply = api.page.getByRole('textbox', {name: 'Reply'})
      await reply.waitFor()
      await expectLocator(reply).toBeFocused({timeout: 30_000})

      for (const name of ['Previous thread', 'Next thread', 'Resolve thread', 'Delete thread', 'Close thread'])
        await api.page.getByRole('button', {name}).waitFor()

      await api.callToolApproved('comment_reply', {
        cid,
        parts: [{type: 'text', text: 'and here is a reply'}],
        authorKind: 'ai',
        authorModel: 'Opus',
      })
      await api.page.getByText('and here is a reply').waitFor({timeout: 30_000})
    } finally {
      await api.dispose()
    }
  })
})

describe('thread delete', () => {
  test('deleting a thread root removes its replies and pin', async () => {
    const api = await bootWhiteboard()
    try {
      await openCanvas(api.page)
      const cid = crypto.randomUUID()
      await createFloatingComment(api, cid, 'thread to delete')
      await api.callToolApproved('comment_reply', {cid, parts: [{type: 'text', text: 'a reply that should also go'}]})

      const pin = api.page.getByRole('button', {name: /comment, open/})
      await pin.waitFor({timeout: 30_000})

      await api.callToolApproved('comment_delete', {cid})

      await expectLocator(pin).toHaveCount(0, {timeout: 30_000})
      expect(await api.page.getByText('thread to delete').count()).toBe(0)
      expect(await api.page.getByText('a reply that should also go').count()).toBe(0)
    } finally {
      await api.dispose()
    }
  })

  test('the delete confirmation interrupts as an alertdialog named by one visible heading', async () => {
    const api = await bootWhiteboard()
    try {
      await openCanvas(api.page)
      const cid = crypto.randomUUID()
      await createFloatingComment(api, cid, 'thread to confirm')

      await openThreadPin(api.page)

      const remove = api.page.getByRole('button', {name: 'Delete thread'})
      await remove.waitFor({timeout: 30_000})
      await remove.focus()
      await remove.press('Enter')

      const confirm = api.page.getByRole('alertdialog', {name: 'Delete this thread?'})
      await confirm.waitFor({timeout: 30_000})
      await expectLocator(confirm.getByText('Delete this thread?')).toHaveCount(1, {timeout: 30_000})
    } finally {
      await api.dispose()
    }
  })
})

describe('thread empty', () => {
  test('the thread card closes when its root comment is gone, leaving no empty header', async () => {
    const api = await bootWhiteboard()
    try {
      await openCanvas(api.page)
      const cid = crypto.randomUUID()
      await createFloatingComment(api, cid, 'open then vanish')

      await openThreadPin(api.page)
      await api.page.getByRole('button', {name: 'Close thread'}).waitFor({timeout: 30_000})

      await api.callToolApproved('comment_delete', {cid})

      await expectLocator(api.page.getByRole('button', {name: 'Close thread'})).toHaveCount(0, {timeout: 30_000})
      expect(await api.page.getByRole('button', {name: 'Resolve thread'}).count()).toBe(0)
    } finally {
      await api.dispose()
    }
  })
})

describe('thread mention', () => {
  test('the mention composer lists participants and stores a mention in the shadow overlay', async () => {
    const api = await bootWhiteboard()
    try {
      await openCanvas(api.page)
      const cid = crypto.randomUUID()
      await createFloatingComment(api, cid, 'root note', {authorModel: 'Opus'})

      const pin = api.page.getByRole('button', {name: /comment, open/})
      await pin.waitFor({timeout: 30_000})
      await pin.focus()
      await pin.press('Enter')

      const editor = api.page.getByRole('textbox', {name: 'Reply'})
      await editor.waitFor()
      await editor.focus()
      await api.page.keyboard.type('ping @Op')

      await api.page.getByRole('option', {name: 'Opus'}).waitFor({timeout: 30_000})
      await api.page.keyboard.press('Enter')
      await api.page.getByText('@Opus').waitFor()

      await api.page.keyboard.press('Enter')

      await api.page.getByText('ping').waitFor({timeout: 30_000})
      await api.page.getByText('@Opus').waitFor()
    } finally {
      await api.dispose()
    }
  })
})

describe('thread unread', () => {
  test('an agent comment is unread until the dev opens it', async () => {
    const api = await bootWhiteboard()
    try {
      await openCanvas(api.page)
      await createFloatingComment(api, crypto.randomUUID(), 'please review', {authorModel: 'Opus'})

      const unread = api.page.getByRole('button', {name: /comment, open, unread/})
      await unread.waitFor({timeout: 30_000})

      await unread.focus()
      await unread.press('Enter')

      await expectLocator(api.page.getByRole('button', {name: /unread/})).toHaveCount(0, {timeout: 30_000})
      await api.page.getByRole('button', {name: /comment, open/}).waitFor()
    } finally {
      await api.dispose()
    }
  })
})

describe('tool catalog', () => {
  const Listed = z
    .object({
      tools: z.array(
        z.object({name: z.string(), summary: z.string(), category: z.string(), mutating: z.boolean()}).loose(),
      ),
    })
    .loose()

  const Detail = z
    .object({name: z.string(), output: z.unknown(), errors: z.array(z.object({code: z.string()}).loose())})
    .loose()

  const DECLARED_MUTATING: Record<string, boolean> = {
    canvas_read: false,
    canvas_svg: true,
    canvas_preview: false,
    canvas_export: false,
    canvas_draw: true,
    canvas_diagram: true,
    canvas_connect: true,
    canvas_update: true,
    canvas_delete: true,
    canvas_clear: true,
    canvas_commit: true,
    canvas_discard: true,
    comment_create: true,
    comment_reply: true,
    comment_read: false,
    comment_list: false,
    comment_resolve: true,
    comment_delete: true,
    comment_move: true,
    pin_set_state: true,
    anchor_resolve: false,
    element_reference: false,
  }

  const EXPECTED_NAMES = new Set(Object.keys(DECLARED_MUTATING))

  test('the sandbox catalog carries exactly the twenty-two whiteboard declarations with honest mutating flags', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      const listed = Listed.parse(await api.runTypescript("return await external_catalog({search: 'whiteboard'})"))
      const whiteboardTools = listed.tools.filter((tool) => tool.category === 'whiteboard')
      const actualNames = new Set(whiteboardTools.map((tool) => tool.name))
      expect(actualNames).toEqual(EXPECTED_NAMES)
      const byName = new Map(whiteboardTools.map((tool) => [tool.name, tool]))
      for (const [name, mutating] of Object.entries(DECLARED_MUTATING)) {
        const entry = byName.get(name)
        expect(entry, name).toBeDefined()
        expect(entry?.mutating, name).toBe(mutating)
        expect(entry?.summary, name).not.toBe('')
      }
    } finally {
      await api.dispose()
    }
  })

  const DECLARED_ERRORS: Record<string, string[]> = {
    canvas_svg: ['INVALID_SVG'],
    canvas_diagram: ['DIAGRAM_TOO_LARGE'],
    canvas_export: ['EXPORT_TIMEOUT'],
    canvas_commit: ['COMMIT_TIMEOUT'],
    comment_reply: ['COMMENT_NOT_FOUND'],
    comment_read: ['COMMENT_NOT_FOUND'],
    comment_resolve: ['COMMENT_NOT_FOUND'],
    comment_delete: ['COMMENT_NOT_FOUND'],
    comment_move: ['PIN_NOT_FOUND'],
    pin_set_state: ['PIN_NOT_FOUND'],
    anchor_resolve: ['COMMENT_NOT_FOUND'],
  }

  type OutputShape =
    | {kind: 'object'; properties: string[]; required: string[]}
    | {kind: 'union'; members: OutputShape[]}
    | {kind: 'array'}

  type JsonSchemaNode = {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    anyOf?: JsonSchemaNode[]
  }

  const JsonSchemaNode: z.ZodType<JsonSchemaNode> = z.lazy(() =>
    z
      .object({
        type: z.string().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
        required: z.array(z.string()).optional(),
        anyOf: z.array(JsonSchemaNode).optional(),
      })
      .loose(),
  )

  function shapeOf(node: JsonSchemaNode): OutputShape {
    if (node.anyOf !== undefined) return {kind: 'union', members: node.anyOf.map(shapeOf)}
    if (node.type === 'array') return {kind: 'array'}
    return {
      kind: 'object',
      properties: Object.keys(node.properties ?? {}).toSorted(),
      required: (node.required ?? []).toSorted(),
    }
  }

  const EXPECTED_OUTPUT_SHAPES: Record<string, OutputShape> = {
    canvas_read: {kind: 'object', properties: ['elements', 'scope'], required: ['elements', 'scope']},
    canvas_svg: {kind: 'object', properties: ['pending'], required: ['pending']},
    canvas_draw: {kind: 'object', properties: ['pending'], required: ['pending']},
    canvas_diagram: {kind: 'object', properties: ['pending'], required: ['pending']},
    canvas_connect: {kind: 'object', properties: ['pending'], required: ['pending']},
    canvas_update: {kind: 'object', properties: ['updated'], required: ['updated']},
    canvas_delete: {kind: 'object', properties: ['deleted'], required: ['deleted']},
    canvas_clear: {kind: 'object', properties: ['cleared'], required: ['cleared']},
    canvas_export: {
      kind: 'union',
      members: [
        {kind: 'array'},
        {kind: 'object', properties: ['error', 'reason', 'scope'], required: ['error', 'reason', 'scope']},
        {kind: 'object', properties: ['elements'], required: ['elements']},
      ],
    },
    canvas_commit: {
      kind: 'union',
      members: [
        {kind: 'object', properties: ['committed', 'elements'], required: ['committed', 'elements']},
        {kind: 'object', properties: ['committed', 'reason'], required: ['committed', 'reason']},
      ],
    },
    canvas_discard: {
      kind: 'object',
      properties: ['discarded', 'error', 'reason'],
      required: ['discarded'],
    },
    canvas_preview: {
      kind: 'union',
      members: [
        {kind: 'array'},
        {kind: 'object', properties: ['empty', 'reason'], required: ['empty', 'reason']},
        {kind: 'object', properties: ['elements', 'error', 'reason'], required: ['elements', 'error', 'reason']},
      ],
    },
    comment_create: {kind: 'object', properties: ['cid'], required: ['cid']},
    comment_reply: {kind: 'object', properties: ['cid'], required: ['cid']},
    comment_read: {kind: 'object', properties: ['comment', 'replies'], required: ['comment', 'replies']},
    comment_list: {kind: 'object', properties: ['comments'], required: ['comments']},
    comment_resolve: {kind: 'object', properties: ['cid', 'status'], required: ['cid', 'status']},
    comment_delete: {kind: 'object', properties: ['cid', 'deleted'], required: ['cid', 'deleted']},
    comment_move: {kind: 'object', properties: ['cid', 'x', 'y'], required: ['cid', 'x', 'y']},
    pin_set_state: {kind: 'object', properties: ['cid', 'pinState'], required: ['cid', 'pinState']},
    anchor_resolve: {
      kind: 'object',
      properties: ['anchor', 'candidates', 'diff', 'status'],
      required: ['status'],
    },
    element_reference: {
      kind: 'object',
      properties: ['column', 'file', 'found', 'line'],
      required: ['found'],
    },
  }

  test('every whiteboard declaration exposes the exact declared errors and output schema through the catalog', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      for (const name of Object.keys(DECLARED_MUTATING)) {
        const detail = Detail.parse(await api.runTypescript(`return await external_catalog({name: '${name}'})`))
        const expectedCodes = DECLARED_ERRORS[name] ?? []
        const declaredCodes = detail.errors.map((error) => error.code).toSorted()
        expect(declaredCodes, name).toEqual(expectedCodes.toSorted())
        const expectedShape = EXPECTED_OUTPUT_SHAPES[name]
        if (expectedShape === undefined) throw new Error(`no expected output shape recorded for "${name}"`)
        expect(shapeOf(JsonSchemaNode.parse(detail.output)), name).toEqual(expectedShape)
      }
    } finally {
      await api.dispose()
    }
  })

  test('a thrown COMMENT_NOT_FOUND surfaces its declared code through the real call path', async () => {
    const api = await getExtensionTestApi({server: whiteboard, host: testHost})
    try {
      await expect(api.callTool('comment_read', {cid: 'nonexistent-cid'})).rejects.toThrow(/COMMENT_NOT_FOUND/)
    } finally {
      await api.dispose()
    }
  })
})
