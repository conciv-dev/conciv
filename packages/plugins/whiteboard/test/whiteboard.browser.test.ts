import {realpathSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from '@playwright/test'
import type {Locator, Page} from 'playwright'
import {z} from 'zod'
import {test} from '@conciv/browser-fixture'
import {magicLink} from '@conciv/harness-testkit/login'
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
const TIE_BREAK_MARKER = 'tie-break-marker'
const MOVED_DIAMOND_WRITE = {
  path: WHITEBOARD_CALL,
  input: {rpcId: 'whiteboard', method: /^elements\.(bulkU|u)psert$/, input: /"elementId":"drawn-while-away"/},
}
const SAVED_BEFORE_POSITION = 'saved-before-position'
const CATCH_UP_RETRY_MS = 20
const SinceRead = z.object({changes: z.array(z.object({key: z.string()}))})
const PinRows = z.array(z.object({cid: z.string(), pinState: z.string()}).loose())
const ThreadRead = z.object({
  comment: z.object({status: z.string()}).loose(),
  replies: z.array(z.object({parts: z.array(z.unknown())}).loose()),
})
const CommentList = z.object({comments: z.array(z.object({cid: z.string()}).loose())})

const MALFORMED_SVG = "<svg viewBox='0 0 10 10'><rect x='0' y='0' width='10' height='10'></svg>"
const UNDRAWABLE_SVG = "<svg viewBox='0 0 10 10'><g></g></svg>"
const SCRIPT_MARKER = 'svg markup ran as script'
const HOSTILE_SVG = `<svg viewBox='0 0 100 50' onload="document.title='${SCRIPT_MARKER}'"><image href='missing.png' onerror="document.title='${SCRIPT_MARKER}'"/><rect x='0' y='0' width='100' height='50' fill='#e03131'/></svg>`

async function canvasElements(kit: CoreKit, scope: 'live' | 'draft'): Promise<{id: string; type: string}[]> {
  const read = CanvasRead.parse(await kit.callTool('whiteboard_canvas_read', {scope}))
  return read.elements.map((element) => ({id: element.id, type: element.type}))
}

async function canvasTypes(kit: CoreKit, scope: 'live' | 'draft' = 'live'): Promise<string[]> {
  const read = CanvasRead.parse(await kit.callTool('whiteboard_canvas_read', {scope}))
  return read.elements.map((element) => element.type)
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
  test('opens from its composer pill, draws with the keyboard and the pointer, closes on Escape and still takes what the agent draws, reopens with the drawing kept, converts what the agent draws, commits it, exports a PNG, a second tab catches up after a reconnect, the canvas outlives a minimized chat and a failed load tells the user', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [[PACKAGE_DIR, {catchUpRetryMs: CATCH_UP_RETRY_MS}]],
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

      await page.mouse.click(120, 640)
      await page.keyboard.press('r')
      await expect(rectangleTool).toBeChecked()
      const drawn = observer.mark()
      await dragRectangle(page, {x: 200, y: 200}, {x: 360, y: 320})
      await observer.completed({
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'elements.upsert'},
        since: drawn,
      })
      expect(await canvasTypes(widget.kit)).toEqual(['rectangle'])

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
      expect(await canvasTypes(widget.kit)).toEqual(['rectangle'])

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

      const draftBeforeCommit = await canvasElements(widget.kit, 'draft')
      const liveWrites = await Promise.all(
        ['elements.upsert', 'elements.bulkUpsert'].map((method) =>
          garbleRpcReplies(page, {path: WHITEBOARD_CALL, input: {rpcId: 'whiteboard', method, input: {scope: 'live'}}}),
        ),
      )
      expect(Committed.parse(await widget.kit.callTool('whiteboard_canvas_commit', {})).committed).toBe(false)
      expect(await canvasElements(widget.kit, 'draft')).toEqual(draftBeforeCommit)
      expect(await canvasTypes(widget.kit)).toEqual(['rectangle'])
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
        'text',
        'text',
      ])

      const [, image] = Exported.parse(await widget.kit.callTool('whiteboard_canvas_export', {format: 'png'}))
      expect(image.source.mimeType).toBe('image/png')
      expect(image.source.value).toMatch(/^iVBORw0KGgo/)

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
        await second.mouse.click(120, 640)
        await second.keyboard.press('ControlOrMeta+a')
        await second.keyboard.press('ArrowDown')
        await secondWrite.awaitCaptured(1)
        const firstMoved = observer.mark()
        await page.mouse.click(120, 640)
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

        await second.mouse.click(120, 640)
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

      await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeHidden()
      await expect(rectangleTool).toBeVisible()

      const failing = await browser.newPage()
      try {
        const failureLogs: string[] = []
        failing.on('console', (message) => {
          if (message.type() === 'error' && message.text().startsWith('[whiteboard] the canvas failed to open')) {
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
        await expect(failing.getByRole('status').filter({hasText: 'The whiteboard is unavailable.'})).toBeVisible()
        expect(failureLogs).toHaveLength(1)
        await failing.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
        await expect(failedToast).toHaveCount(2)
        expect(failureLogs).toHaveLength(2)
        await chunks.dispose()
        await failing.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
        await expect(failing.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 10_000})
        await expect(failing.getByRole('status').filter({hasText: 'The whiteboard is unavailable.'})).toBeHidden()
      } finally {
        await failing.close()
      }
    } finally {
      await widget.close()
    }
  })
})

describe('the comments of the whiteboard plugin', () => {
  test('an agent comment becomes an unread pin on the open canvas, clicking the pin marks its thread read, a dragged pin lands on the engine, only comments from others make a thread unread again, and Escape on a thread stepped to its first closes only the thread', async ({
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
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.setViewportSize({width: 1280, height: 800})
      await openChat(page)
      await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click({timeout: 30_000})
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible({timeout: 60_000})

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
      await pin.click()
      const thread = page.getByRole('dialog', {name: 'Comment thread'})
      await expect(thread.getByText('the header overlaps the logo')).toBeVisible()
      const readPin = page.getByRole('button', {name: 'AI comment, open', exact: true})
      await expect(readPin).toBeVisible()

      const dragged = observer.mark()
      await dragPin(page, readPin, {x: 740, y: 410})
      await observer.completed({
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'pins.update'},
        since: dragged,
      })
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
      await expect(thread.getByRole('button', {name: 'Previous thread'})).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible()
      await expect(page.getByRole('button', {name: 'AI comment, open', exact: true})).toHaveCount(2)
    } finally {
      await widget.close()
    }
  }, 120_000)

  test('the thread beside a pin hides the chat while open, takes a reply the agent reads, closes on Escape with the canvas kept, steps to the next and previous thread, resolves, deletes through its confirm, and a dropped source-linked pin asks before it drifts', async ({
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
      await reply.pressSequentially('moving it left')
      await page.keyboard.press('Enter')
      await expect(thread.getByText('moving it left')).toBeVisible()
      await observer.completed({
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'comments.insert'},
        since: replied,
      })
      const read = ThreadRead.parse(await widget.kit.callTool('whiteboard_comment_read', {cid: 'older'}))
      expect(read.replies).toMatchObject([{parts: [{type: 'text', text: 'moving it left'}]}])

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

      await expect(thread.getByRole('button', {name: 'Previous thread'})).toBeDisabled()
      await thread.getByRole('button', {name: 'Next thread'}).click()
      await expect(thread.getByText('the button has no focus ring')).toBeVisible()
      await expect(thread.getByText('the header overlaps the logo')).toBeHidden()
      await expect(thread.getByRole('button', {name: 'Next thread'})).toBeDisabled()
      await thread.getByRole('button', {name: 'Previous thread'}).click()
      await expect(thread.getByText('the header overlaps the logo')).toBeVisible()

      const resolved = observer.mark()
      await thread.getByRole('button', {name: 'Resolve thread'}).click()
      await expect(thread).toBeHidden()
      await expect(page.getByRole('button', {name: 'AI comment, resolved'})).toBeVisible()
      await observer.completed({
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'comments.update'},
        since: resolved,
      })
      const afterResolve = ThreadRead.parse(await widget.kit.callTool('whiteboard_comment_read', {cid: 'older'}))
      expect(afterResolve.comment.status).toBe('resolved')

      await readPin.click()
      await expect(thread.getByText('the button has no focus ring')).toBeVisible()
      const deleted = observer.mark()
      await thread.getByRole('button', {name: 'Delete thread'}).click()
      const confirm = page.getByRole('dialog', {name: 'Delete this thread?'})
      await confirm.getByRole('button', {name: 'Delete'}).click()
      await expect(confirm).toBeHidden()
      await expect(thread).toBeHidden()
      await expect(page.getByRole('button', {name: /^AI comment, open/})).toHaveCount(0)
      await observer.completed({
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'comments.remove'},
        since: deleted,
      })
      await observer.completed({
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'pins.remove'},
        since: deleted,
      })
      const left = CommentList.parse(await widget.kit.callTool('whiteboard_comment_list', {scope: 'session'}))
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
      await expect(readPin).toHaveCount(0)
      await dragPin(page, unreadPin, {x: 300, y: 580})
      const drift = page.getByRole('dialog', {name: 'Pin drift'})
      await expect(drift.getByRole('button', {name: 'Disconnect from source'})).toBeVisible()
      await expect(drift.getByRole('button', {name: 'Cancel'})).toBeVisible()
      const pill = page.getByRole('button', {name: 'Open the whiteboard canvas'})
      await pill.click()
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeHidden()
      await pill.click()
      await expect(page.getByRole('radio', {name: /Rectangle/})).toBeVisible()
      await expect(drift).toBeHidden()
      await unreadPin.click()
      await expect(thread.getByText('this label is off by one')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(thread).toBeHidden()
      await dragPin(page, readPin, {x: 620, y: 580})
      await expect(drift.getByRole('button', {name: 'Keep link, accept drift'})).toBeVisible()
      const kept = observer.mark()
      await drift.getByRole('button', {name: 'Keep link, accept drift'}).click()
      await expect(drift).toBeHidden()
      await observer.completed({
        path: WHITEBOARD_CALL,
        input: {rpcId: 'whiteboard', method: 'pins.update'},
        since: kept,
      })
      const room = await widget.kit.session()
      const pins = PinRows.parse(
        await widget.kit.rpc.plugin.call(
          {rpcId: 'whiteboard', method: 'pins.list', input: {room}},
          {signal: AbortSignal.timeout(30_000)},
        ),
      )
      expect(pins.find((row) => row.cid === 'linked')).toMatchObject({pinState: 'offset'})
    } finally {
      await widget.close()
    }
  }, 120_000)
})
