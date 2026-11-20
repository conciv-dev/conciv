import {realpathSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from '@playwright/test'
import type {Browser, Locator, Page} from 'playwright'
import {z} from 'zod'
import {test} from '@conciv/plugin-testkit/node'
import {makeRpcClient} from '@conciv/harness-testkit'
import {magicLink} from '@conciv/harness-testkit/login'
import {readApprovalAsk} from '@conciv/protocol/chat-event-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {CoreKit} from '@conciv/plugin-testkit/core-kit'
import {rpcObserverFor} from '@conciv/plugin-testkit/rpc-observer'
import {failRpcCalls, garbleRpcReplies, gateRpcCalls, holdRpcCalls} from '@conciv/plugin-testkit/rpc-fault'
import {rpcSocketFor} from '@conciv/plugin-testkit/rpc-socket'
import {openPluginWidget} from '@conciv/plugin-testkit/widget-suite'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const WIDGET_BUNDLE = join(dirname(createRequire(import.meta.url).resolve('@conciv/embed')), 'conciv-widget.global.js')

const WHITEBOARD_CALL = ['plugin', 'call']

const Pending = z.object({pending: z.string()})

const PendingIds = z.array(z.object({id: z.string()}).loose())
const Committed = z.object({committed: z.boolean()})
const Exported = z.tuple([
  z.unknown(),
  z.object({type: z.literal('image'), source: z.object({mimeType: z.string(), value: z.string()})}),
])

const CanvasRead = z.object({elements: z.array(z.object({id: z.string(), type: z.string()}).loose())})
const ShownElement = z.object({version: z.number(), index: z.string()}).loose()
const PlacedElement = ShownElement.extend({id: z.string(), x: z.number(), y: z.number()})
const DrawnBox = z.object({x: z.number(), y: z.number(), width: z.number(), height: z.number()}).loose()
const ELEMENT_WRITE_THROTTLE_MS = 50
const DRAG_DISTANCE = 200
const TIE_BREAK_MARKER = 'tie-break-marker'
const MOVED_DIAMOND_WRITE = {
  path: WHITEBOARD_CALL,
  input: {rpcId: 'whiteboard', method: /^elements\.(bulkU|u)psert$/, input: /"elementId":"drawn-while-away"/},
}
const SAVED_BEFORE_POSITION = 'saved-before-position'
const CATCH_UP_RETRY_MS = 20
const DRAW_DEADLINE_MS = 2_000
const SinceRead = z.object({changes: z.array(z.object({key: z.string()}))})
const PinRows = z.array(z.object({cid: z.string(), pinState: z.string(), x: z.number(), y: z.number()}).loose())
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const CARD_TURN = {
  toolCalls: [
    {name: 'whiteboard_canvas_read', input: {scope: 'live'}, result: {elements: [{}, {}, {}], scope: 'live'}},
    {
      name: 'whiteboard_canvas_preview',
      input: {},
      result: [
        {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}},
        {type: 'text', content: JSON.stringify({elements: 2})},
      ],
    },
    {name: 'whiteboard_canvas_delete', input: {elementId: 'el_9'}, result: {deleted: 'el_9'}},
    {name: 'whiteboard_canvas_export', input: {}, result: {error: 'export render failed', reason: 'no renderer'}},
    {
      name: 'whiteboard_comment_create',
      input: {
        cid: 'c_42',
        kind: 'floating',
        parts: [{type: 'text', text: 'Looks off-center'}],
        x: 1,
        y: 2,
        authorKind: 'ai',
      },
      result: {cid: 'c_42'},
    },
    {name: 'whiteboard_comment_list', input: {}, result: {comments: [{}, {}]}},
    {name: 'whiteboard_comment_delete', input: {cid: 'c_42'}, result: {cid: 'c_42', deleted: true}},
    {
      name: 'whiteboard_pin_set_state',
      input: {cid: 'c_42', pinState: 'locked'},
      result: {cid: 'c_42', pinState: 'locked'},
    },
  ],
  text: 'The board is checked',
}
const ThreadRead = z.object({
  comment: z.object({status: z.string()}).loose(),
  replies: z.array(z.object({parts: z.array(z.unknown())}).loose()),
})
const CommentList = z.object({comments: z.array(z.object({cid: z.string()}).loose())})
const QUIET_WRITE = {
  path: WHITEBOARD_CALL,
  input: {
    rpcId: 'whiteboard',
    method: /^(?!.*\.(list|get|since)$)/,
  },
}

const MALFORMED_SVG = "<svg viewBox='0 0 10 10'><rect x='0' y='0' width='10' height='10'></svg>"
const UNDRAWABLE_SVG = "<svg viewBox='0 0 10 10'><g></g></svg>"
const SCRIPT_MARKER = 'svg markup ran as script'
const DENSE_SVG = `<svg viewBox='0 0 100 100'><path d="${'M0 0 L5 5 '.repeat(2000)}" stroke='#000'/></svg>`
const DEGENERATE_SVG =
  "<svg viewBox='0 0 100 100'><path d='M z'/><rect x='10' y='10' width='20' height='20' fill='#ccc'/></svg>"
const HOSTILE_SVG = `<svg viewBox='0 0 100 50' onload="document.title='${SCRIPT_MARKER}'"><image href='missing.png' onerror="document.title='${SCRIPT_MARKER}'"/><rect x='0' y='0' width='100' height='50' fill='#e03131'/></svg>`

function whiteboardCall(method: string | RegExp, since: number, input?: RegExp) {
  return {path: WHITEBOARD_CALL, input: {rpcId: 'whiteboard', method, ...(input ? {input} : {})}, since}
}

async function canvasElements(kit: CoreKit, scope: 'live' | 'draft'): Promise<{id: string; type: string}[]> {
  const read = CanvasRead.parse(await kit.callTool('whiteboard_canvas_read', {scope}))
  return read.elements.map((element) => ({id: element.id, type: element.type}))
}

async function canvasTypes(kit: CoreKit, scope: 'live' | 'draft' = 'live'): Promise<string[]> {
  const read = CanvasRead.parse(await kit.callTool('whiteboard_canvas_read', {scope}))
  return read.elements.map((element) => element.type)
}

async function drawnBoxes(kit: CoreKit): Promise<z.infer<typeof DrawnBox>[]> {
  return DrawnBox.array().parse(CanvasRead.parse(await kit.callTool('whiteboard_canvas_read', {})).elements)
}

function writeBudget(dragMs: number): number {
  return Math.ceil(dragMs / ELEMENT_WRITE_THROTTLE_MS) + 2
}

async function pointerDrag(page: Page, from: {x: number; y: number}, to: {x: number; y: number}): Promise<number> {
  const startedAt = Date.now()
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, {steps: 90})
  await page.mouse.up()
  return Date.now() - startedAt
}

async function approvedTool(kit: CoreKit, name: string, input: unknown): Promise<unknown> {
  const room = await kit.session()
  const events = await kit.events(room)
  const result = kit.callTool(name, input)
  const asked = readApprovalAsk(await events.waitFor((event) => readApprovalAsk(event) !== null))
  if (asked === null) throw new Error(`${name} raised no permission ask`)
  const session = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: room}})
  await session.chat.permissionDecision({approvalId: asked.approvalId, reply: 'once'})
  return result
}

async function holdPickerChunk(page: Page): Promise<() => void> {
  const held = Promise.withResolvers<void>()
  await page.route('**/widget/dist-*.js', async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    if (body.includes('react-grab-cursor')) await held.promise
    await route.fulfill({response, body})
  })
  return held.resolve
}

async function openChat(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 10_000})
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 10_000})
}

async function dragRectangle(page: Page, from: {x: number; y: number}, to: {x: number; y: number}): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

async function dragPin(page: Page, pin: Locator, to: {x: number; y: number}): Promise<void> {
  await pin.hover()
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, {steps: 4})
  await page.mouse.up()
}

describe('the whiteboard canvas of the whiteboard plugin', () => {
  test('opens from its composer pill, draws with the keyboard and the pointer at its real size, drags one shape the full distance in few writes and a selected group in bulk writes, closes on Escape and still takes what the agent draws, reopens with the drawing kept, keeps its main menu open while the canvas background is picked and closes it on a canvas click, converts what the agent draws, commits it, exports a PNG, caps a dense svg and skips a broken node, a second tab catches up after a reconnect, the canvas outlives a minimized chat and a failed load tells the user', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [[PACKAGE_DIR, {catchUpRetryMs: CATCH_UP_RETRY_MS, drawDeadlineMs: DRAW_DEADLINE_MS}]],
      widgetBundle: WIDGET_BUNDLE,
      stateRoot: realpathSync(tempDir('conciv-whiteboard-canvas-')),
    })
    try {
      const page = widget.page
      const observer = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.setViewportSize({width: 1280, height: 800})
      await openChat(page)

      const pill = page.getByRole('button', {name: 'Open the whiteboard canvas'})
      await pill.click({timeout: 10_000})
      const rectangleTool = page.getByRole('radio', {name: /Rectangle/})
      await expect(rectangleTool).toBeVisible({timeout: 10_000})

      await page.mouse.click(300, 760)
      await page.keyboard.press('r')
      await expect(rectangleTool).toBeChecked()
      await dragRectangle(page, {x: 240, y: 200}, {x: 400, y: 320})
      await expect
        .poll(async () => (await drawnBoxes(widget.kit)).map((box) => ({width: box.width, height: box.height})))
        .toEqual([{width: 160, height: 120}])
      expect(await canvasTypes(widget.kit)).toEqual(['rectangle'])
      const [drawnBox] = await drawnBoxes(widget.kit)
      const startX = drawnBox?.x ?? 0

      const selectionTool = page.getByRole('radio', {name: /Selection/})
      await expect(selectionTool).toBeChecked()
      const singleDrag = observer.mark()
      const singleDragMs = await pointerDrag(page, {x: 280, y: 260}, {x: 280 + DRAG_DISTANCE, y: 260})
      await expect.poll(async () => (await drawnBoxes(widget.kit))[0]?.x).toBe(startX + DRAG_DISTANCE)
      const singleWrites = observer.startedCount(whiteboardCall('elements.upsert', singleDrag))
      expect(singleWrites).toBeGreaterThan(1)
      expect(singleWrites).toBeLessThanOrEqual(writeBudget(singleDragMs))
      expect(observer.startedCount(whiteboardCall('elements.bulkUpsert', singleDrag))).toBe(0)
      expect((await drawnBoxes(widget.kit))[0]).toMatchObject({width: 160, height: 120})

      await page.keyboard.press('r')
      await expect(rectangleTool).toBeChecked()
      const secondDrawn = observer.mark()
      await dragRectangle(page, {x: 640, y: 200}, {x: 760, y: 320})
      await observer.completed(whiteboardCall('elements.upsert', secondDrawn))
      const beforeGroupDrag = await drawnBoxes(widget.kit)
      expect(beforeGroupDrag).toHaveLength(2)
      await expect(selectionTool).toBeChecked()
      await dragRectangle(page, {x: 380, y: 170}, {x: 800, y: 350})
      const groupDrag = observer.mark()
      const groupDragMs = await pointerDrag(page, {x: 480, y: 260}, {x: 480, y: 260 + DRAG_DISTANCE})
      await expect
        .poll(async () => (await drawnBoxes(widget.kit)).map((box) => box.y))
        .toEqual(beforeGroupDrag.map((box) => box.y + DRAG_DISTANCE))
      const groupBulkWrites = observer.startedCount(whiteboardCall('elements.bulkUpsert', groupDrag))
      expect(groupBulkWrites).toBeGreaterThan(0)
      expect(groupBulkWrites + observer.startedCount(whiteboardCall('elements.upsert', groupDrag))).toBeLessThanOrEqual(
        writeBudget(groupDragMs),
      )
      expect((await drawnBoxes(widget.kit))[0]).toMatchObject({width: 160, height: 120})

      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      const stop = page.getByRole('button', {name: 'Stop generating'})
      widget.kit.harness.script.hold()
      await composer.click()
      await page.keyboard.type('keep this turn running')
      await page.keyboard.press('Enter')
      await expect(stop).toBeVisible({timeout: 10_000})
      await composer.click()
      await page.keyboard.press('Escape')
      await expect(rectangleTool).toBeHidden()
      await expect(page.getByRole('button', {name: 'Zoom in'})).toBeHidden()
      await expect(stop).toBeVisible()
      await expect(composer).toBeVisible()
      widget.kit.harness.script.release()
      await expect(stop).toBeHidden({timeout: 10_000})
      await expect(composer).toBeFocused()
      await page.keyboard.type('the canvas is closed')
      await expect(composer).toHaveText('the canvas is closed')

      expect(
        Pending.parse(
          await widget.kit.callTool('whiteboard_canvas_draw', {
            elements: [{id: 'drawn-while-closed', type: 'line', x: 200, y: 400, width: 160, height: 0}],
          }),
        ),
      ).toEqual({pending: expect.any(String)})
      expect(await canvasTypes(widget.kit, 'draft')).toEqual(['line'])

      await pill.click()
      await expect(rectangleTool).toBeVisible({timeout: 10_000})
      await expect(page.getByRole('button', {name: 'Zoom in'})).toBeVisible()
      await expect(rectangleTool).not.toBeChecked()
      expect(await canvasTypes(widget.kit)).toEqual(['rectangle', 'rectangle'])

      const chatLayers = [
        {
          opener: page.getByRole('button', {name: 'More composer actions'}),
          layer: page.getByRole('menu', {name: 'More composer actions'}),
        },
        {
          opener: page.getByRole('button', {name: /, session options$/}),
          layer: page.getByRole('dialog', {name: 'Session options'}),
        },
        {
          opener: page.getByRole('button', {name: /^Model: /}),
          layer: page.getByRole('textbox', {name: 'Search models'}),
        },
      ]
      for (const {opener, layer} of chatLayers) {
        await opener.click()
        await expect(layer).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(layer).toBeHidden()
        await expect(rectangleTool).toBeVisible()
        await expect(composer).toBeVisible()
      }

      const mainMenu = page.getByRole('button', {name: '', exact: true})
      await mainMenu.click()
      const resetCanvas = page.getByRole('button', {name: 'Reset the canvas'})
      await expect(resetCanvas).toBeVisible()
      await page.getByRole('button', {name: '#fffce8'}).click()
      await expect(resetCanvas).toBeVisible()
      await page.getByRole('button', {name: 'Canvas background'}).click()
      const backgroundHex = page.getByRole('textbox', {name: 'Canvas background'})
      await expect(backgroundHex).toHaveValue('fffce8')
      await page.keyboard.press('Escape')
      await expect(backgroundHex).toBeHidden()
      await expect(resetCanvas).toBeHidden()
      await mainMenu.click()
      await expect(resetCanvas).toBeVisible()
      await page.mouse.click(300, 760)
      await expect(resetCanvas).toBeHidden()
      await expect(rectangleTool).toBeVisible()

      expect(
        Pending.parse(
          await widget.kit.callTool('whiteboard_canvas_draw', {
            elements: [{type: 'ellipse', x: 420, y: 160, width: 120, height: 80}],
          }),
        ),
      ).toEqual({pending: expect.any(String)})
      expect(
        Pending.parse(
          await widget.kit.callTool('whiteboard_canvas_svg', {
            svg: "<svg viewBox='0 0 100 50'><rect x='0' y='0' width='100' height='50' fill='#1971c2'/></svg>",
            x: 420,
            y: 300,
            width: 200,
          }),
        ),
      ).toEqual({pending: expect.any(String)})
      expect(
        Pending.parse(await widget.kit.callTool('whiteboard_canvas_diagram', {mermaid: 'flowchart LR\n  A --> B'})),
      ).toEqual({pending: expect.any(String)})
      expect((await canvasTypes(widget.kit, 'draft')).toSorted()).toEqual([
        'arrow',
        'ellipse',
        'line',
        'rectangle',
        'rectangle',
        'rectangle',
        'text',
        'text',
      ])

      const hostileByTool = Pending.parse(
        await widget.kit.callTool('whiteboard_canvas_svg', {svg: HOSTILE_SVG, x: 660, y: 300, width: 200}),
      )
      const room = await widget.kit.session()
      const pendingRemoved = {
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'canvasPending.remove', input: {id: 'svg-over-rpc'}},
      }
      const removeFails = await failRpcCalls(page, pendingRemoved)
      const insertedOverRpc = observer.mark()
      await widget.kit.rpc.plugin.call(
        {
          rpcId: 'whiteboard',
          method: 'canvasPending.insert',
          input: {
            room,
            row: {
              id: 'svg-over-rpc',
              kind: 'svg',
              stage: 'draft',
              payload: {svg: HOSTILE_SVG, x: 660, y: 420, width: 200, roughness: 1},
            },
          },
        },
        {signal: AbortSignal.timeout(10_000)},
      )
      await removeFails.answered()
      await removeFails.dispose()
      await observer.completed({...pendingRemoved, since: insertedOverRpc, status: 200})
      expect(
        PendingIds.parse(
          await widget.kit.rpc.plugin.call(
            {rpcId: 'whiteboard', method: 'canvasPending.list', input: {room}},
            {signal: AbortSignal.timeout(10_000)},
          ),
        ).map((row) => row.id),
      ).not.toContain('svg-over-rpc')
      const hostileIds = [`${hostileByTool.pending}-0`, 'svg-over-rpc-0']
      expect((await canvasElements(widget.kit, 'draft')).filter((element) => hostileIds.includes(element.id))).toEqual(
        hostileIds.map((id) => ({id, type: 'rectangle'})),
      )
      expect(await page.title()).not.toBe(SCRIPT_MARKER)
      await expect(
        widget.kit.callTool('whiteboard_canvas_svg', {svg: MALFORMED_SVG, x: 660, y: 540, width: 100}),
      ).rejects.toThrow('the svg is not well-formed')
      await expect(
        widget.kit.callTool('whiteboard_canvas_svg', {svg: UNDRAWABLE_SVG, x: 660, y: 540, width: 100}),
      ).rejects.toThrow('the svg had nothing drawable')

      const slowDraftWrite = await gateRpcCalls(page, {
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'elements.bulkUpsert', input: {scope: 'draft'}},
      })
      const slowDrawing = widget.kit.callTool('whiteboard_canvas_svg', {
        svg: "<svg viewBox='0 0 100 50'><rect x='0' y='0' width='100' height='50' fill='#2f9e44'/></svg>",
        x: 900,
        y: 300,
        width: 200,
      })
      await slowDraftWrite.awaitCaptured(1)
      await expect(
        widget.kit.callTool(
          'whiteboard_canvas_draw',
          {elements: [{type: 'ellipse', x: 0, y: 0, width: 10, height: 10}]},
          await widget.kit.session('a-session-with-no-canvas'),
        ),
      ).rejects.toThrow('no canvas is open to draw into')
      await slowDraftWrite.release()
      const slowPending = Pending.parse(await slowDrawing)
      await slowDraftWrite.dispose()
      expect(await canvasElements(widget.kit, 'draft')).toContainEqual({
        id: `${slowPending.pending}-0`,
        type: 'rectangle',
      })

      const draftBeforeCommit = await canvasElements(widget.kit, 'draft')
      const liveWrites = await Promise.all(
        ['elements.upsert', 'elements.bulkUpsert'].map((method) =>
          garbleRpcReplies(page, {path: WHITEBOARD_CALL, input: {rpcId: 'whiteboard', method, input: {scope: 'live'}}}),
        ),
      )
      expect(Committed.parse(await widget.kit.callTool('whiteboard_canvas_commit', {})).committed).toBe(false)
      expect(await canvasElements(widget.kit, 'draft')).toEqual(draftBeforeCommit)
      expect(await canvasTypes(widget.kit)).toEqual(['rectangle', 'rectangle'])
      await Promise.all(liveWrites.map((fault) => fault.dispose()))

      expect(Committed.parse(await widget.kit.callTool('whiteboard_canvas_commit', {})).committed).toBe(true)
      expect(await canvasTypes(widget.kit, 'draft')).toEqual([])
      expect((await canvasTypes(widget.kit)).toSorted()).toEqual([
        'arrow',
        'ellipse',
        'line',
        'rectangle',
        'rectangle',
        'rectangle',
        'rectangle',
        'rectangle',
        'rectangle',
        'rectangle',
        'rectangle',
        'text',
        'text',
      ])

      const [, image] = Exported.parse(await widget.kit.callTool('whiteboard_canvas_export', {format: 'png'}))
      expect(image.source.mimeType).toBe('image/png')
      expect(image.source.value).toMatch(/^iVBORw0KGgo/)

      Pending.parse(await widget.kit.callTool('whiteboard_canvas_svg', {svg: DENSE_SVG, x: 0, y: 0, width: 200}))
      expect(
        z
          .array(z.unknown())
          .parse(
            await widget.kit.rpc.plugin.call(
              {rpcId: 'whiteboard', method: 'elements.list', input: {room, scope: 'draft'}},
              {signal: AbortSignal.timeout(10_000)},
            ),
          ),
      ).toHaveLength(500)
      await widget.kit.callTool('whiteboard_canvas_discard', {})
      Pending.parse(await widget.kit.callTool('whiteboard_canvas_svg', {svg: DEGENERATE_SVG, x: 0, y: 0, width: 200}))
      expect(await canvasTypes(widget.kit, 'draft')).toEqual(['rectangle'])
      await widget.kit.callTool('whiteboard_canvas_discard', {})
      expect(await canvasTypes(widget.kit, 'draft')).toEqual([])

      const second = await browser.newPage()
      try {
        const secondObserver = rpcObserverFor(second)
        const secondSocket = await holdRpcCalls(second)
        await rpcSocketFor(second).installed
        const positionRead = await gateRpcCalls(second, {
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'since'},
        })
        await second.goto(await magicLink(widget.kit.base, new URL('/', page.url()).href), {
          waitUntil: 'domcontentloaded',
        })
        await second.setViewportSize({width: 1280, height: 800})
        await expect(second.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 10_000})
        await second.getByRole('button', {name: 'Open the whiteboard canvas'}).click({timeout: 10_000})
        await positionRead.awaitCaptured(1)
        const liveList = {
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'elements.list', input: {scope: 'live'}},
        }
        if (secondObserver.startedCount(liveList) > 0) await secondObserver.completed(liveList)
        const shownElements = ShownElement.array().parse(
          CanvasRead.parse(await widget.kit.callTool('whiteboard_canvas_read', {})).elements,
        )
        const [shown] = shownElements
        const lastIndex = shownElements
          .map((element) => element.index)
          .toSorted()
          .at(-1)
        await widget.kit.rpc.plugin.call(
          {
            rpcId: 'whiteboard',
            method: 'elements.upsert',
            input: {
              room,
              scope: 'live',
              row: {
                elementId: SAVED_BEFORE_POSITION,
                data: {...shown, id: SAVED_BEFORE_POSITION, x: 900, index: `${lastIndex}V`},
                version: shown?.version ?? 1,
              },
            },
          },
          {signal: AbortSignal.timeout(10_000)},
        )
        await positionRead.dispose()
        await expect(second.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 10_000})
        await secondObserver.completed({path: WHITEBOARD_CALL, input: {rpcId: 'whiteboard', method: 'elements.list'}})

        await secondSocket.hold()
        await widget.kit.callTool('whiteboard_canvas_draw', {
          elements: [{id: 'drawn-while-away', type: 'diamond', x: 640, y: 160, width: 100, height: 100}],
        })
        expect(Committed.parse(await widget.kit.callTool('whiteboard_canvas_commit', {})).committed).toBe(true)
        const missedRead = await failRpcCalls(second, {
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'since'},
        })
        const reconnected = secondObserver.mark()
        secondSocket.release()
        await secondObserver.completed({
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'since'},
          since: reconnected,
          status: 500,
          timeout: 10_000,
        })
        await missedRead.dispose()
        const missedAgain = await secondObserver.completed({
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'since'},
          since: reconnected,
          served: true,
          timeout: 10_000,
        })
        expect(SinceRead.parse(missedAgain.output).changes.map((change) => change.key)).toContain('drawn-while-away')
        await secondObserver.completed({
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'elements.get', input: {elementId: 'drawn-while-away'}},
          since: reconnected,
        })

        const placedElements = async () =>
          PlacedElement.array().parse(
            CanvasRead.parse(await widget.kit.callTool('whiteboard_canvas_read', {})).elements,
          )
        const beforeMoves = PlacedElement.parse(
          (await placedElements()).find((element) => element.id === 'drawn-while-away'),
        )
        const secondWrite = await gateRpcCalls(second, MOVED_DIAMOND_WRITE)
        await second.mouse.click(300, 760)
        await second.keyboard.press('ControlOrMeta+a')
        await second.keyboard.press('ArrowDown')
        await secondWrite.awaitCaptured(1)
        const firstMoved = observer.mark()
        await page.mouse.click(300, 760)
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.press('ArrowRight')
        await observer.completed({...MOVED_DIAMOND_WRITE, since: firstMoved})
        const released = secondObserver.mark()
        await secondWrite.dispose()
        await secondObserver.completed({...MOVED_DIAMOND_WRITE, since: released})
        const lastPlacedIndex = (await placedElements())
          .map((element) => element.index)
          .toSorted()
          .at(-1)
        await widget.kit.rpc.plugin.call(
          {
            rpcId: 'whiteboard',
            method: 'elements.upsert',
            input: {
              room,
              scope: 'live',
              row: {
                elementId: TIE_BREAK_MARKER,
                data: {...beforeMoves, id: TIE_BREAK_MARKER, index: `${lastPlacedIndex}V`},
                version: beforeMoves.version,
              },
            },
          },
          {signal: AbortSignal.timeout(10_000)},
        )
        await secondObserver.completed({
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'elements.get', input: {elementId: TIE_BREAK_MARKER}},
          since: released,
        })
        const secondMoved = secondObserver.mark()
        await second.keyboard.press('ArrowDown')
        await secondObserver.completed({...MOVED_DIAMOND_WRITE, since: secondMoved})
        expect((await placedElements()).find((element) => element.id === 'drawn-while-away')).toMatchObject({
          x: beforeMoves.x + 1,
          y: beforeMoves.y + 1,
        })

        await second.mouse.click(300, 760)
        const erased = secondObserver.mark()
        await second.keyboard.press('ControlOrMeta+a')
        await second.keyboard.press('Delete')
        await secondObserver.completed({
          path: WHITEBOARD_CALL,
          input: {rpcId: 'whiteboard', method: 'elements.bulkUpsert'},
          since: erased,
        })
        const erasedElements = CanvasRead.parse(await widget.kit.callTool('whiteboard_canvas_read', {}))
        expect(erasedElements.elements.find((element) => element.id === 'drawn-while-away')).toMatchObject({
          isDeleted: true,
        })
        expect(erasedElements.elements.find((element) => element.id === SAVED_BEFORE_POSITION)).toMatchObject({
          isDeleted: true,
        })
        expect(erasedElements.elements.filter((element) => element.type === 'rectangle')).not.toContainEqual(
          expect.objectContaining({isDeleted: false}),
        )

        expect(await canvasTypes(widget.kit, 'draft')).toEqual([])
        expect(
          Pending.parse(
            await widget.kit.callTool('whiteboard_canvas_draw', {
              elements: [
                {
                  id: 'drawn-once',
                  type: 'rectangle',
                  x: 200,
                  y: 520,
                  width: 160,
                  height: 80,
                  label: {text: 'one copy'},
                },
              ],
            }),
          ),
        ).toEqual({pending: expect.any(String)})
        const [, sharedImage] = Exported.parse(await widget.kit.callTool('whiteboard_canvas_export', {format: 'png'}))
        expect(sharedImage.source.value).toMatch(/^iVBORw0KGgo/)
        expect((await canvasTypes(widget.kit, 'draft')).toSorted()).toEqual(['rectangle', 'text'])
        expect(
          await widget.kit.rpc.plugin.call(
            {rpcId: 'whiteboard', method: 'canvasReplies.list', input: {room}},
            {signal: AbortSignal.timeout(10_000)},
          ),
        ).toEqual([])
      } finally {
        await second.close()
      }

      await page.mouse.click(300, 760)
      await page.keyboard.press('t')
      await page.mouse.click(300, 600)
      const typed = observer.mark()
      await page.keyboard.type('draw here')
      await page.keyboard.press('Escape')
      await expect(selectionTool).toBeChecked()
      await observer.completed(whiteboardCall(/^elements\.(bulkU|u)psert$/, typed, /"text":"draw here"/))

      await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeHidden()
      await expect(rectangleTool).toBeVisible()

      const failing = await browser.newPage()
      try {
        const failureLogs: string[] = []
        failing.on('console', (message) => {
          if (/ ERROR \(#\d+\):.*the canvas failed to open/.test(message.text())) {
            failureLogs.push(message.text())
          }
        })
        const chunks = await failRpcCalls(failing, {path: ['plugin', 'experimentalChunk']})
        await failing.goto(await magicLink(widget.kit.base, new URL('/', page.url()).href), {
          waitUntil: 'domcontentloaded',
        })
        await failing.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 10_000})
        const failedToast = failing.getByText('The whiteboard needs a running conciv server')
        await failing.getByRole('button', {name: 'Open the whiteboard canvas'}).click({timeout: 10_000})
        await expect(failedToast).toHaveCount(1, {timeout: 10_000})
        await expect(failing.getByText('The whiteboard is unavailable.')).toHaveCount(0)
        expect(failureLogs).toHaveLength(1)
        await failing.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
        await expect(failedToast).toHaveCount(2)
        expect(failureLogs).toHaveLength(2)
        const commentPill = failing.getByRole('button', {name: 'Comment on an element'})
        await expect(commentPill).toBeHidden()
        await chunks.dispose()
        const slowChunk = await gateRpcCalls(failing, {path: ['plugin', 'experimentalChunk']})
        await failing.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
        const loadingToast = failing.getByRole('region', {name: /Notifications/}).getByText('Loading the whiteboard…')
        await expect(loadingToast).toBeVisible({timeout: 10_000})
        await slowChunk.dispose()
        await expect(failing.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 10_000})
        await expect(loadingToast).toBeHidden()
        await expect(commentPill).toBeVisible()
      } finally {
        await failing.close()
      }
    } finally {
      await widget.close()
    }
  })
})

describe('the comments of the whiteboard plugin', () => {
  test('an agent comment becomes an unread pin on the open canvas, clicking the pin marks its thread read, pointer moves over the canvas write nothing, a dragged pin lands on the engine, only comments from others make a thread unread again, Escape on a thread stepped to its first closes only the thread, and the comment pill waits for the page picker to load, a comment the user puts on a page element hides the canvas while picking and composing, brings it back on Escape or with the new thread open, and only toasts while the canvas is closed', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [[PACKAGE_DIR, {catchUpRetryMs: CATCH_UP_RETRY_MS}]],
      widgetBundle: WIDGET_BUNDLE,
      stateRoot: realpathSync(tempDir('conciv-whiteboard-comments-')),
    })
    try {
      const page = widget.page
      const observer = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      const releasePicker = await holdPickerChunk(page)
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.setViewportSize({width: 1280, height: 800})
      await openChat(page)
      await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click({timeout: 30_000})
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 60_000})
      const inboxToggle = page.getByRole('button', {name: /^Comments/})
      const inbox = page.getByRole('complementary', {name: 'Comments inbox'})
      await inboxToggle.click()
      await expect(inbox.getByText('No comments yet')).toBeVisible()
      await expect(inboxToggle).toBeHidden()
      await inbox.getByRole('button', {name: 'Close inbox'}).click()
      await expect(inbox).toBeHidden()
      await page.mouse.click(300, 760)
      await page.keyboard.press('r')
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeChecked()
      await dragRectangle(page, {x: 240, y: 560}, {x: 520, y: 640})
      await expect
        .poll(async () => (await drawnBoxes(widget.kit)).map((box) => ({width: box.width, height: box.height})))
        .toEqual([{width: 280, height: 80}])

      await widget.kit.callTool('whiteboard_comment_create', {
        cid: 'agent-first',
        kind: 'floating',
        parts: [{type: 'text', text: 'the header overlaps the logo'}],
        x: 640,
        y: 360,
        authorKind: 'ai',
      })
      const pin = page.getByRole('button', {name: 'AI comment, open, unread'})
      await expect(pin).toBeVisible({timeout: 30_000})
      const opened = observer.mark()
      await pin.click()
      const thread = page.getByRole('dialog', {name: 'Comment thread'})
      await expect(thread.getByText('the header overlaps the logo')).toBeVisible()
      const readPin = page.getByRole('button', {name: 'AI comment, open', exact: true})
      await expect(readPin).toBeVisible()
      await observer.completed(whiteboardCall('reads.insert', opened))

      const quiet = observer.mark()
      for (let step = 0; step < 24; step += 1) {
        await page.mouse.move(200 + step * 10, 600 + (step % 2 === 0 ? -8 : 8))
      }
      expect(observer.startedCount({...QUIET_WRITE, since: quiet})).toBe(0)
      await page.getByRole('button', {name: 'Zoom in'}).click()
      await page.getByRole('button', {name: 'Zoom in'}).click()
      await expect(page.getByRole('button', {name: 'Reset zoom'})).toHaveText('120%')
      const dragged = observer.mark()
      await dragPin(page, readPin, {x: 740, y: 410})
      await observer.completed(whiteboardCall('pins.update', dragged))
      expect(observer.startedCount({...QUIET_WRITE, since: quiet})).toBe(1)
      expect(observer.startedCount(whiteboardCall('pins.update', quiet))).toBe(1)
      const room = await widget.kit.session()
      const moved = PinRows.parse(
        await widget.kit.rpc.plugin.call(
          {rpcId: 'whiteboard', method: 'pins.list', input: {room}},
          {signal: AbortSignal.timeout(30_000)},
        ),
      ).find((row) => row.cid === 'agent-first')
      const zoomedAroundCenter = (scene: number, center: number): number => center + (scene - center) * 1.2
      expect(moved?.x).toBeCloseTo(640 + (740 - zoomedAroundCenter(640, 640)) / 1.2, 1)
      expect(moved?.y).toBeCloseTo(360 + (410 - zoomedAroundCenter(360, 400)) / 1.2, 1)
      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 10_000})
      await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click({timeout: 30_000})
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 60_000})
      await readPin.click()
      await expect(thread.getByText('the header overlaps the logo')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()

      const unread = page.getByRole('button', {name: 'AI comment, open, unread'})
      await widget.kit.callTool('whiteboard_comment_reply', {
        cid: 'agent-first',
        parts: [{type: 'text', text: 'and the footer too'}],
      })
      await expect(unread).toBeVisible()
      await expect(readPin).toBeHidden()
      await unread.click()
      await expect(thread.getByText('and the footer too')).toBeVisible()
      await expect(readPin).toBeVisible()
      await expect(unread).toBeHidden()

      const reply = thread.getByRole('textbox', {name: 'Reply'})
      await expect(reply).toBeFocused()
      await reply.pressSequentially('on it')
      await page.keyboard.press('Enter')
      await expect(thread.getByText('on it')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      await widget.kit.callTool('whiteboard_comment_create', {
        cid: 'agent-second',
        kind: 'floating',
        parts: [{type: 'text', text: 'the button has no focus ring'}],
        x: 400,
        y: 200,
        authorKind: 'ai',
      })
      await expect(unread).toBeVisible()
      await expect(readPin).toBeVisible()
      await unread.click()
      await expect(thread.getByText('the button has no focus ring')).toBeVisible()
      await expect(page.getByRole('button', {name: 'AI comment, open', exact: true})).toHaveCount(2)
      await expect(unread).toHaveCount(0)

      await thread.getByRole('button', {name: 'Previous thread'}).click()
      await expect(thread.getByText('the header overlaps the logo')).toBeVisible()
      await thread.getByRole('button', {name: 'Previous thread'}).click()
      await expect(thread.getByText('the button has no focus ring')).toBeVisible()
      await expect(thread.getByText('the header overlaps the logo')).toBeHidden()
      await expect(thread.getByRole('button', {name: 'Previous thread'})).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible()
      await expect(page.getByRole('button', {name: 'AI comment, open', exact: true})).toHaveCount(2)

      const focusedPin = page.getByRole('button', {name: 'AI comment, open', exact: true}).last()
      await page.mouse.click(300, 760)
      await page.keyboard.press('Shift+Tab')
      await expect(focusedPin).toBeFocused()
      const focusedTooltip = page.getByText('AI comment, open', {exact: true})
      await expect(focusedTooltip).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(focusedTooltip).toBeHidden()
      await expect(focusedPin).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(focusedPin).not.toBeFocused()
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible()

      await page.getByRole('button', {name: 'AI comment, open', exact: true}).first().click()
      await expect(thread).toBeVisible()
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await expect(composer).toBeHidden()
      await approvedTool(widget.kit, 'whiteboard_comment_delete', {cid: 'agent-first'})
      await approvedTool(widget.kit, 'whiteboard_comment_delete', {cid: 'agent-second'})
      await expect(page.getByRole('button', {name: /^AI comment/})).toHaveCount(0)
      await expect(thread).toBeHidden()
      await expect(composer).toBeVisible()

      await widget.kit.callTool('whiteboard_comment_create', {
        cid: 'agent-third',
        kind: 'floating',
        parts: [{type: 'text', text: 'the chat covers this'}],
        x: 640,
        y: 360,
        authorKind: 'ai',
      })
      await expect(unread).toBeVisible()
      await unread.dragTo(composer)
      await composer.click({timeout: 5_000})
      await expect(composer).toBeFocused()

      const rectangle = page.getByRole('radio', {name: /Rectangle/})
      const commentPill = page.getByRole('button', {name: 'Comment on an element'})
      const newComment = page.getByRole('dialog', {name: 'New comment'})
      const commentField = newComment.getByRole('textbox', {name: 'Comment', exact: true})
      const pickedElement = page.getByText('page-probe-ok')
      await expect(commentPill).toBeHidden()
      releasePicker()
      await commentPill.click()
      await expect(rectangle).toBeHidden()
      await pickedElement.click({force: true})
      await expect(commentField).toBeFocused()
      await expect(rectangle).toBeHidden()
      await page.keyboard.press('Escape')
      await expect(newComment).toBeHidden()
      await expect(rectangle).toBeVisible()
      await commentPill.click()
      await pickedElement.click({force: true})
      await expect(commentField).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(newComment).toBeHidden()
      await expect(rectangle).toBeVisible()
      await commentPill.click()
      await pickedElement.click({force: true})
      await commentField.pressSequentially('note over the page')
      await page.keyboard.press('Enter')
      await expect(rectangle).toBeVisible()
      await expect(thread.getByText('note over the page')).toBeVisible()
      await expect(page.getByRole('button', {name: 'Human comment, open'})).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
      await expect(rectangle).toBeHidden()
      await commentPill.click()
      await pickedElement.click({force: true})
      await commentField.pressSequentially('silent note')
      await newComment.getByRole('button', {name: 'Add comment'}).click()
      await expect(page.getByText('Comment added to the whiteboard')).toBeVisible()
      await expect(rectangle).toBeHidden()
      await expect(page.getByText('silent note')).toBeHidden()

      await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
      await expect(rectangle).toBeVisible()
      await approvedTool(widget.kit, 'whiteboard_comment_delete', {cid: 'agent-third'})
      const farPin = page.getByRole('button', {name: /^AI comment, open/})
      await expect(farPin).toHaveCount(0)
      for (const note of [
        {cid: 'inbox-first', text: 'first inbox note', authorModel: 'Opus', x: 4000, y: 3000},
        {cid: 'inbox-second', text: 'second inbox note', authorModel: 'Sonnet', x: 640, y: 360},
      ]) {
        await widget.kit.callTool('whiteboard_comment_create', {
          cid: note.cid,
          kind: 'floating',
          parts: [{type: 'text', text: note.text}],
          x: note.x,
          y: note.y,
          authorKind: 'ai',
          authorModel: note.authorModel,
        })
      }
      await expect(inboxToggle).toHaveAccessibleName(/^Comments\s*2/)
      await inboxToggle.click()
      const feed = inbox.getByRole('button', {name: /inbox note/})
      const opus = inbox.getByRole('button', {name: /^Opus/})
      const sonnet = inbox.getByRole('button', {name: /^Sonnet/})
      await expect(feed).toHaveText([/second inbox note/, /first inbox note/])
      await expect(composer).toBeHidden()
      await expect(opus).toHaveAccessibleName(/unread/)
      await expect(opus).not.toContainText(/repl/)
      await sonnet.click()
      await expect(reply).toBeFocused()
      await reply.pressSequentially('on it')
      await page.keyboard.press('Enter')
      await expect(sonnet).toContainText('1 reply')
      await expect(sonnet).not.toHaveAccessibleName(/unread/)
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      const filter = inbox.getByRole('button', {name: 'Filter comments'})
      await filter.click()
      await page.getByRole('menuitemradio', {name: 'Sort by unread'}).click()
      await expect(feed).toHaveText([/first inbox note/, /second inbox note/])
      await sonnet.click()
      await page.getByRole('button', {name: 'Resolve thread'}).click()
      await expect(feed).toHaveText([/first inbox note/])
      await filter.click()
      await page.getByRole('menuitemcheckbox', {name: 'Show resolved comments'}).click()
      await expect(feed).toHaveText([/first inbox note/, /second inbox note/])
      const search = inbox.getByRole('searchbox', {name: 'Quick search'})
      await search.click()
      await search.pressSequentially('zzznomatch')
      await expect(inbox.getByText('No comments match “zzznomatch”.')).toBeVisible()
      await search.press('ControlOrMeta+a')
      await search.press('Backspace')
      await search.pressSequentially('first')
      await expect(feed).toHaveText([/first inbox note/])
      await search.press('ControlOrMeta+a')
      await search.press('Backspace')
      await expect(inbox.getByRole('button', {name: /unread/})).toHaveCount(1)
      await inbox.getByRole('button', {name: 'Mark all as read'}).click()
      await expect(inbox.getByRole('button', {name: /unread/})).toHaveCount(0)
      await expect(farPin).not.toBeInViewport()
      await opus.click()
      await expect(thread.getByText('first inbox note')).toBeVisible()
      await expect(farPin).toBeInViewport()
      await inbox.getByRole('button', {name: 'Close inbox'}).click()
      await expect(inboxToggle).toHaveAccessibleName('Comments')
    } finally {
      await widget.close()
    }
  }, 120_000)

  test('the agent whiteboard tool calls show as cards in the chat, the thread beside a pin hides the chat while open, takes a reply with an @mention of a participant the agent reads, closes on Escape with the canvas kept, steps to the next and previous thread, resolves, deletes through its confirm, a dropped source-linked pin asks before it drifts, and an open thread whose root the agent deletes closes', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [[PACKAGE_DIR, {catchUpRetryMs: CATCH_UP_RETRY_MS}]],
      widgetBundle: WIDGET_BUNDLE,
      stateRoot: realpathSync(tempDir('conciv-whiteboard-thread-')),
    })
    try {
      const page = widget.page
      const observer = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.setViewportSize({width: 1280, height: 800})
      await openChat(page)
      widget.kit.harness.script.scriptTurn(CARD_TURN)
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.click()
      await composer.pressSequentially('check the board')
      await composer.press('Enter')
      await expect(page.getByText('The board is checked', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(page.getByText('whiteboard_canvas_read')).toBeVisible()
      await expect(page.getByText('3 elements').first()).toBeVisible()
      await page.getByRole('button', {name: /whiteboard_canvas_preview/}).click()
      await expect(page.getByRole('img', {name: 'canvas preview'})).toBeVisible()
      await page.getByRole('button', {name: /whiteboard_canvas_delete/}).click()
      await expect(page.getByText('delete el_9')).toBeVisible()
      await page.getByRole('button', {name: /whiteboard_canvas_export/}).click()
      await expect(page.getByText('export render failed · no renderer')).toBeVisible()
      await page.getByRole('button', {name: /whiteboard_comment_create/}).click()
      await expect(page.getByText('Looks off-center')).toBeVisible()
      await expect(page.getByText('c_42').first()).toBeVisible()
      await expect(page.getByText('2 comments').first()).toBeVisible()
      await page.getByRole('button', {name: /whiteboard_comment_delete/}).click()
      await expect(page.getByText('delete', {exact: true}).last()).toBeVisible()
      await expect(page.getByText('deleted').first()).toBeVisible()
      await expect(page.getByText('locked').first()).toBeVisible()
      await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click({timeout: 30_000})
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 60_000})

      await widget.kit.callTool('whiteboard_comment_create', {
        cid: 'older',
        kind: 'floating',
        parts: [{type: 'text', text: 'the header overlaps the logo'}],
        x: 640,
        y: 360,
        authorKind: 'ai',
      })
      const unreadPin = page.getByRole('button', {name: 'AI comment, open, unread'})
      await expect(unreadPin).toBeVisible({timeout: 30_000})

      await unreadPin.click()
      const thread = page.getByRole('dialog', {name: 'Comment thread'})
      await expect(thread.getByText('the header overlaps the logo')).toBeVisible()
      const reply = thread.getByRole('textbox', {name: 'Reply'})
      await expect(reply).toBeFocused()
      const chat = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await expect(chat).toBeHidden()

      const replied = observer.mark()
      await reply.pressSequentially('moving it left @A')
      const mentionOption = page.getByRole('option', {name: 'AI'})
      await expect(mentionOption).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(mentionOption).toBeHidden()
      await expect(reply.getByText('@AI')).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(thread.getByRole('paragraph').filter({hasText: 'moving it left @AI'})).toBeVisible()
      await expect(reply).toHaveText('')
      await observer.completed(whiteboardCall('comments.insert', replied))
      const read = ThreadRead.parse(await widget.kit.callTool('whiteboard_comment_read', {cid: 'older'}))
      expect(read.replies).toMatchObject([
        {
          parts: [
            {type: 'text', text: 'moving it left '},
            {type: 'mention', id: 'ai:AI', label: 'AI'},
            {type: 'text', text: ' '},
          ],
        },
      ])

      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible()
      await expect(chat).toBeVisible()
      await widget.kit.callTool('whiteboard_comment_create', {
        cid: 'newer',
        kind: 'floating',
        parts: [{type: 'text', text: 'the button has no focus ring'}],
        x: 400,
        y: 200,
        authorKind: 'ai',
      })
      await expect(unreadPin).toBeVisible()
      const readPin = page.getByRole('button', {name: 'AI comment, open', exact: true})
      await readPin.click()
      await expect(thread.getByText('moving it left')).toBeVisible()

      await thread.getByRole('button', {name: 'Next thread'}).click()
      await expect(thread.getByText('the button has no focus ring')).toBeVisible()
      await expect(thread.getByText('the header overlaps the logo')).toBeHidden()
      await thread.getByRole('button', {name: 'Next thread'}).click()
      await expect(thread.getByText('the header overlaps the logo')).toBeVisible()
      await expect(thread.getByText('the button has no focus ring')).toBeHidden()
      await expect(thread.getByRole('button', {name: 'Next thread'})).toBeFocused()

      const resolved = observer.mark()
      await thread.getByRole('button', {name: 'Resolve thread'}).click()
      await expect(thread).toBeHidden()
      await expect(page.getByRole('button', {name: 'AI comment, resolved'})).toBeVisible()
      await observer.completed(whiteboardCall('comments.update', resolved))
      const afterResolve = ThreadRead.parse(await widget.kit.callTool('whiteboard_comment_read', {cid: 'older'}))
      expect(afterResolve.comment.status).toBe('resolved')

      await readPin.click()
      await expect(thread.getByText('the button has no focus ring')).toBeVisible()
      const deleted = observer.mark()
      await thread.getByRole('button', {name: 'Delete thread'}).click()
      const confirm = page.getByRole('dialog', {name: 'Delete this thread?'})
      await expect(confirm.getByRole('button', {name: 'Cancel'})).toBeFocused()
      await confirm.getByRole('button', {name: 'Delete'}).click()
      await expect(confirm).toBeHidden()
      await expect(thread).toBeHidden()
      await expect(page.getByRole('button', {name: /^AI comment, open/})).toHaveCount(0)
      await observer.completed(whiteboardCall('comments.remove', deleted))
      await observer.completed(whiteboardCall('pins.remove', deleted))
      const left = CommentList.parse(await widget.kit.callTool('whiteboard_comment_list', {}))
      expect(left.comments.map((comment) => comment.cid)).toEqual(['older'])

      await widget.kit.callTool('whiteboard_comment_create', {
        cid: 'linked',
        kind: 'source-linked',
        anchor: {source: {file: 'src/app.tsx', line: 3}},
        parts: [{type: 'text', text: 'this label is off by one'}],
        x: 560,
        y: 520,
        authorKind: 'ai',
      })
      await expect(unreadPin).toBeVisible({timeout: 30_000})
      await expect(page.getByText('app.tsx:3', {exact: true})).toBeVisible()
      await expect(readPin).toHaveCount(0)
      await unreadPin.hover()
      const pinTooltip = page.getByText('AI comment, open, unread', {exact: true})
      await expect(pinTooltip).toBeVisible()
      await page.mouse.down()
      await page.mouse.move(300, 580, {steps: 4})
      await expect(pinTooltip).toBeHidden()
      await page.mouse.up()
      const drift = page.getByRole('dialog', {name: 'Pin drift'})
      await expect(drift.getByRole('heading', {name: 'app.tsx:3'})).toBeVisible()
      await expect(drift.getByRole('button', {name: 'Disconnect from source'})).toBeVisible()
      await expect(chat).toBeHidden()
      await drift.getByRole('button', {name: 'Cancel'}).click()
      await expect(drift).toBeHidden()
      await expect(chat).toBeVisible()
      await unreadPin.click()
      await expect(thread.getByText('this label is off by one')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      const readTooltip = page.getByText('AI comment, open', {exact: true})
      await readPin.hover()
      await page.mouse.down()
      await page.mouse.move(600, 570, {steps: 60})
      await expect(readTooltip).toBeHidden()
      await page.mouse.move(620, 580, {steps: 30})
      await expect(readTooltip).toBeHidden()
      await page.mouse.up()
      await expect(drift.getByRole('button', {name: 'Keep link, accept drift'})).toBeVisible()
      await expect(readTooltip).toBeHidden()
      const kept = observer.mark()
      await drift.getByRole('button', {name: 'Keep link, accept drift'}).click()
      await expect(drift).toBeHidden()
      await observer.completed(whiteboardCall('pins.update', kept))
      const room = await widget.kit.session()
      const pins = PinRows.parse(
        await widget.kit.rpc.plugin.call(
          {rpcId: 'whiteboard', method: 'pins.list', input: {room}},
          {signal: AbortSignal.timeout(30_000)},
        ),
      )
      expect(pins.find((row) => row.cid === 'linked')).toMatchObject({pinState: 'offset'})

      const refused = await failRpcCalls(page, {
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'comments.update'},
      })
      await readPin.click()
      await expect(thread.getByText('this label is off by one')).toBeVisible()
      await thread.getByRole('button', {name: 'Resolve thread'}).click()
      await expect(page.getByText('Could not save your whiteboard change. Try again.')).toBeVisible()
      await expect(readPin).toBeVisible()
      await refused.dispose()

      await readPin.click()
      await expect(thread.getByText('this label is off by one')).toBeVisible()
      await approvedTool(widget.kit, 'whiteboard_comment_delete', {cid: 'linked'})
      await expect(thread).toBeHidden()
    } finally {
      await widget.close()
    }
  }, 120_000)
})

const HOST_TEXT = 'Host page under the canvas'
const HOST_BODY = `<h1 style="position:fixed;top:45%;left:40px;margin:0;font:700 40px sans-serif;color:#c2255c">${HOST_TEXT}</h1>`

const CANVAS_BACKGROUND_SWITCH = 'Canvas background: see the page through the canvas'

async function chooseSolidCanvas(page: Page): Promise<void> {
  await page.getByRole('link', {name: 'Settings'}).click({timeout: 10_000})
  const transparent = page.getByRole('switch', {name: CANVAS_BACKGROUND_SWITCH})
  await expect(transparent).toBeChecked({timeout: 10_000})
  await transparent.press('Space')
  await expect(transparent).not.toBeChecked()
  await page.getByRole('button', {name: 'Back to chat'}).click()
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 10_000})
}

async function hostTextUnderCanvas(browser: Browser, solid: boolean): Promise<{closed: Buffer; open: Buffer}> {
  const widget = await openPluginWidget(browser, {
    id: 'fake',
    plugins: [PACKAGE_DIR],
    widgetBundle: WIDGET_BUNDLE,
    stateRoot: realpathSync(tempDir('conciv-whiteboard-background-')),
    body: HOST_BODY,
  })
  try {
    const page = widget.page
    await page.setViewportSize({width: 1280, height: 800})
    await openChat(page)
    if (solid) await chooseSolidCanvas(page)
    const hostText = page.getByRole('heading', {name: HOST_TEXT})
    const closed = await hostText.screenshot({animations: 'disabled'})
    await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click({timeout: 10_000})
    await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 10_000})
    return {closed, open: await hostText.screenshot({animations: 'disabled'})}
  } finally {
    await widget.close()
  }
}

describe('the whiteboard canvas background', () => {
  test('lets the host page show through by default and covers it once the settings row turns it solid', async ({
    browser,
  }) => {
    const transparent = await hostTextUnderCanvas(browser, false)
    expect(transparent.open.equals(transparent.closed)).toBe(true)
    const solid = await hostTextUnderCanvas(browser, true)
    expect(solid.open.equals(solid.closed)).toBe(false)
  })
})
