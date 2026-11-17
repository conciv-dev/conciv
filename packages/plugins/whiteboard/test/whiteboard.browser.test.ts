import {realpathSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from '@playwright/test'
import type {Page} from 'playwright'
import {z} from 'zod'
import {test} from '@conciv/browser-fixture'
import type {CoreKit} from '@conciv/plugin-testkit/core-kit'
import {rpcObserverFor} from '@conciv/plugin-testkit/rpc-observer'
import {rpcSocketFor} from '@conciv/plugin-testkit/rpc-socket'
import {openPluginWidget} from '@conciv/plugin-testkit/widget-suite'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const WIDGET_BUNDLE = join(dirname(createRequire(import.meta.url).resolve('@conciv/embed')), 'conciv-widget.global.js')

const WHITEBOARD_CALL = ['plugin', 'call']

const Pending = z.object({pending: z.string()})

const Committed = z.object({committed: z.boolean()})
const Exported = z.tuple([
  z.unknown(),
  z.object({type: z.literal('image'), source: z.object({mimeType: z.string(), value: z.string()})}),
])

const CanvasRead = z.object({elements: z.array(z.object({type: z.string()}).loose())})

async function canvasTypes(kit: CoreKit, scope: 'live' | 'draft' = 'live'): Promise<string[]> {
  const read = CanvasRead.parse(await kit.callTool('whiteboard_canvas_read', {scope}))
  return read.elements.map((element) => element.type)
}

async function openChat(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
}

async function dragRectangle(page: Page, from: {x: number; y: number}, to: {x: number; y: number}): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

describe('the whiteboard canvas of the whiteboard plugin', () => {
  test('opens from its composer pill, draws with the keyboard and the pointer, closes on Escape, reopens with the drawing kept, converts what the agent draws, commits it and exports a PNG', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [PACKAGE_DIR],
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
      await pill.click({timeout: 30_000})
      const rectangleTool = page.getByRole('radio', {name: /Rectangle/})
      await expect(rectangleTool).toBeVisible({timeout: 60_000})

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
      await composer.click()
      await page.keyboard.press('Escape')
      await expect(rectangleTool).toBeHidden()
      await expect(composer).toBeFocused()
      await page.keyboard.type('the canvas is closed')
      await expect(composer).toHaveText('the canvas is closed')

      await pill.click()
      await expect(rectangleTool).toBeVisible({timeout: 60_000})
      await expect(rectangleTool).not.toBeChecked()
      expect(await canvasTypes(widget.kit)).toEqual(['rectangle'])

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
      expect(await canvasTypes(widget.kit, 'draft')).toEqual(expect.arrayContaining(['ellipse', 'rectangle', 'arrow']))

      expect(Committed.parse(await widget.kit.callTool('whiteboard_canvas_commit', {})).committed).toBe(true)
      expect(await canvasTypes(widget.kit, 'draft')).toEqual([])
      expect(await canvasTypes(widget.kit)).toEqual(expect.arrayContaining(['rectangle', 'ellipse', 'arrow']))

      const [, image] = Exported.parse(await widget.kit.callTool('whiteboard_canvas_export', {format: 'png'}))
      expect(image.source.mimeType).toBe('image/png')
      expect(image.source.value).toMatch(/^iVBORw0KGgo/)
    } finally {
      await widget.close()
    }
  }, 240_000)
})
