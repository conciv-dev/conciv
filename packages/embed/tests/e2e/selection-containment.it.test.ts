import {expect, test, type Page} from '@playwright/test'
import {serveHost} from '@conciv/extension-testkit/serve-host'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage} from '../helpers/host.js'
import {openPanel, sendMessage} from './helpers/panel.js'

const ASSISTANT_REPLY = 'The widget reply stays selectable inside the chat thread for quoting.'

const HOST_TEXT = 'Host page article text that must never join a chat selection.'

const HOST_STYLES: Record<string, string> = {
  'a host page with default selection styles': '',
  'a host page that forces its article text selectable': 'main p{user-select:text}',
  'a host page that forces its article text selectable with !important': 'main p{user-select:text !important}',
}

const hostBody = (url: URL) => `
  <style>${HOST_STYLES[url.searchParams.get('host') ?? ''] ?? ''}</style>
  <main style="padding:48px 60% 0 24px;font:20px/1.6 sans-serif">
    <p>${HOST_TEXT}</p>
    <p>${HOST_TEXT}</p>
    <p>${HOST_TEXT}</p>
  </main>
`

type Point = {x: number; y: number}

type SelectionEnds = {startInWidget: boolean; endInWidget: boolean; text: string}

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

test.beforeEach(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_REPLY})
  host = await serveHost((url) => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: hostBody(url)}))
})

test.afterEach(async () => {
  await host.close()
  await kit.cleanup()
})

async function openWithReply(page: Page, hostStyle = ''): Promise<void> {
  await page.setViewportSize({width: 1400, height: 900})
  await page.goto(`${host.base}/?${new URLSearchParams({host: hostStyle})}`, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
  await sendMessage(page, 'say something selectable', ASSISTANT_REPLY)
}

async function textStart(page: Page, text: string): Promise<Point> {
  const box = await page.getByText(text).first().boundingBox()
  expect(box).not.toBeNull()
  return {x: (box?.x ?? 0) + 60, y: (box?.y ?? 0) + (box?.height ?? 0) / 2}
}

async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, {steps: 12})
  await page.mouse.up()
}

function selectionEnds(page: Page): Promise<SelectionEnds> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-conciv-root]')?.shadowRoot
    const selection = document.getSelection()
    const range = root ? selection?.getComposedRanges({shadowRoots: [root]})[0] : undefined
    return {
      startInWidget: range?.startContainer.getRootNode() === root,
      endInWidget: range?.endContainer.getRootNode() === root,
      text: selection?.toString() ?? '',
    }
  })
}

test.describe('text selection and the host page', () => {
  const outwardDrags: {name: string; target: (page: Page) => Promise<Point>; selects: RegExp}[] = [
    {
      name: 'up past the top of the panel',
      target: async (page) => ({...(await textStart(page, ASSISTANT_REPLY)), y: 2}),
      selects: /^\s*CONCIV[\s\S]*say something selectable[\s\S]*The widge$/,
    },
    {name: 'sideways over host page text', target: (page) => textStart(page, HOST_TEXT), selects: /^The widge$/},
    {
      name: 'down past the bottom of the panel',
      target: async (page) => ({...(await textStart(page, ASSISTANT_REPLY)), y: 895}),
      selects: /^t reply stays selectable inside the chat thread for quoting\.\s*$/,
    },
  ]

  for (const hostStyle of Object.keys(HOST_STYLES)) {
    for (const outward of outwardDrags) {
      test(`on ${hostStyle}, a selection dragged from the chat reply ${outward.name} stays inside the widget`, async ({
        page,
      }) => {
        test.setTimeout(120_000)
        await openWithReply(page, hostStyle)

        await drag(page, await textStart(page, ASSISTANT_REPLY), await outward.target(page))

        const ends = await selectionEnds(page)
        expect(ends.text).toMatch(outward.selects)
        expect(ends).toMatchObject({startInWidget: true, endInWidget: true})
      })
    }
  }

  test('a selection started on the host page and dragged over the panel still selects host text', async ({page}) => {
    test.setTimeout(120_000)
    await openWithReply(page)

    await drag(page, await textStart(page, HOST_TEXT), await textStart(page, ASSISTANT_REPLY))

    const ends = await selectionEnds(page)
    expect(ends.text).toContain('page article text')
    expect(ends.startInWidget).toBe(false)
  })
})
