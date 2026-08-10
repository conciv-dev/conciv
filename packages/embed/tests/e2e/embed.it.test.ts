import {expect, test, type Page} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../helpers/boot.js'
import {hostPage, serveHost} from '../helpers/host.js'
import {rpcObserverFor} from '@conciv/extension-testkit/rpc-observer'
import {
  currentHref,
  freezeClock,
  holdFirstNavigationWrite,
  setNavigation,
  waitForNavigationWrite,
  waitForNavigationWriteCarrying,
} from './helpers/navigation.js'
import {openPanel, sendMessage} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Hello from conciv'
const HARNESS_MODELS = [
  {id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5'},
  {id: 'claude-opus-4-1', name: 'Claude Opus 4.1'},
]
const PHONE_VIEWPORT = {width: 393, height: 800}
const SHEET_INTERIOR_CLIP = {x: 40, y: 150, width: 313, height: 120}
const HOST_HEADING = 'Deployment checklist'
const LONG_HOST_BODY = `<h1>Host site</h1>${Array.from(
  {length: 60},
  (_unused, index) => `<p>Host paragraph ${index} that the reader is scrolled through.</p>`,
).join('')}<h2>${HOST_HEADING}</h2>${Array.from(
  {length: 60},
  (_unused, index) => `<p>Host paragraph ${index + 60} below the heading.</p>`,
).join('')}`

let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}
let longHost: {base: string; close: () => Promise<void>}

test.beforeAll(async () => {
  kit = await bootEmbedKit({text: ASSISTANT_TEXT, models: HARNESS_MODELS})
  host = await serveHost((url) =>
    hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', backdrop: url.searchParams.get('backdrop')}),
  )
  longHost = await serveHost(() =>
    hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: LONG_HOST_BODY}),
  )
})

test.afterAll(async () => {
  await host.close()
  await longHost.close()
  await kit.cleanup()
})

test.beforeEach(async () => {
  expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
})

function observedPage(page: Page): Page {
  rpcObserverFor(page)
  return page
}

async function openPage(page: Page): Promise<Page> {
  observedPage(page)
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  return page
}

async function sendAndRevealThought(page: Page, message: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(message)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
  await page.getByText('Chain of Thought').last().click()
}

test.describe('embed boots the conciv app against a real core', () => {
  test('canonicalizes a restored panel route that carries a raw harness session id', async ({page}) => {
    const rawHarnessId = '43548fd1-0000-4220-acf0-014b10b5815f'
    expect(await setNavigation(kit, [{href: `/panel/${rawHarnessId}`}])).toBe(true)
    observedPage(page)
    const canonicalized = waitForNavigationWrite(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await canonicalized
    expect(await currentHref(kit)).toMatch(/^\/panel\/conciv_/)
    const adopted = await kit.rpc.sessions.resolve({id: rawHarnessId})
    const persisted = await kit.rpc.navigation.get()
    expect(persisted?.entries[persisted.index]?.href).toBe(`/panel/${adopted.sessionId}`)
  })

  test('a widget navigation write that lands after a newer one loses, even in flight', async ({page}) => {
    observedPage(page)
    const held = await holdFirstNavigationWrite(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await held.arrived

    expect(await setNavigation(kit, [{href: '/reset-while-the-widget-write-is-in-flight'}])).toBe(true)
    const landed = waitForNavigationWrite(page)
    held.release()
    await landed

    expect(await currentHref(kit)).toBe('/reset-while-the-widget-write-is-in-flight')
  })

  test('a reloaded page outranks the previous page in-flight write when both clocks read the same', async ({
    page,
    context,
  }) => {
    const frozen = Date.now()
    const before = observedPage(page)
    await freezeClock(before, frozen)
    const held = await holdFirstNavigationWrite(before)
    expect((await kit.rpc.navigation.set({entries: [{href: '/'}], index: 0, updatedAt: frozen + 5_000})).applied).toBe(
      true,
    )
    await before.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(before)
    await held.arrived

    const after = observedPage(await context.newPage())
    await freezeClock(after, frozen)
    await after.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(after)
    const switched = waitForNavigationWriteCarrying(after, '/terminal')
    await after.getByRole('tab', {name: 'Terminal'}).click()
    await switched
    expect(await currentHref(kit)).toContain('/terminal')

    const landed = waitForNavigationWrite(before)
    held.release()
    await landed

    expect(await currentHref(kit)).toContain('/terminal')
  })

  test('fab close is a shutter: reopening restores the same view without touching history', async ({page}) => {
    await openPage(page)
    await openPanel(page)
    await page.getByRole('tab', {name: 'Terminal'}).click()
    await expect(page.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true', {
      timeout: 30_000,
    })
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    const reopened = waitForNavigationWrite(page)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect(page.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true', {
      timeout: 30_000,
    })
    await reopened
    const persisted = await kit.rpc.navigation.get()
    expect(persisted?.entries.filter((entry) => entry.href.includes('/panel/'))).toHaveLength(1)
  })

  test('a reload restores the panel open on the same view', async ({page, context}) => {
    const first = await openPage(page)
    await openPanel(first)
    const switched = waitForNavigationWriteCarrying(first, '/terminal')
    await first.getByRole('tab', {name: 'Terminal'}).click()
    await switched
    expect(await currentHref(kit)).toMatch(/\/terminal\?.*open=true/)
    await first.close()
    const second = await openPage(await context.newPage())
    await expect(second.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expect(second.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true', {
      timeout: 30_000,
    })
  })

  test('a reload after closing the panel boots shut', async ({page, context}) => {
    const first = observedPage(page)
    const opened = waitForNavigationWrite(first)
    await first.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(first)
    await opened
    expect(await currentHref(kit)).toContain('open=true')
    const shut = waitForNavigationWrite(first)
    await first.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await shut
    expect(await currentHref(kit)).not.toContain('open=true')
    await first.close()
    const second = await openPage(await context.newPage())
    await expect(second.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
    expect(await second.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(0)
  })

  test('renders the fab instantly and opens the panel', async ({page}) => {
    await openPage(page)
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
    await openPanel(page)
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
  })

  test('opening and closing the panel keeps the host page where the reader scrolled it', async ({page}) => {
    observedPage(page)
    await page.goto(longHost.base, {waitUntil: 'domcontentloaded'})
    const heading = page.getByRole('heading', {name: HOST_HEADING})
    const headingTop = async () => (await heading.boundingBox())?.y ?? Number.NaN
    const unscrolled = await headingTop()

    await page.mouse.wheel(0, unscrolled - 200)
    await expect(heading).toBeInViewport({timeout: 30_000})
    const readerPosition = await headingTop()
    expect(readerPosition).toBeLessThan(unscrolled - 1000)

    await openPanel(page)
    expect(await headingTop()).toBe(readerPosition)

    await page.getByRole('textbox', {name: 'Message the conciv agent'}).press('Escape')
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    expect(await headingTop()).toBe(readerPosition)
  })

  test('sends a message and renders the assistant reply from the fake harness', async ({page}) => {
    await openPage(page)
    await openPanel(page)
    await sendMessage(page, 'hi there', ASSISTANT_TEXT)
  })

  test('shows Stop instead of Send while a run is streaming; typing stays enabled', async ({page}) => {
    await openPage(page)
    await openPanel(page)
    kit.harness.script.hold()
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('long question')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByRole('button', {name: 'Stop generating'})).toBeVisible({timeout: 30_000})
    await input.fill('still typing while it runs')
    await expect(input).toHaveText('still typing while it runs')
    kit.harness.script.release()
    await expect(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
  })

  test('Escape closes the panel back to the fab', async ({page}) => {
    await openPage(page)
    await openPanel(page)
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).press('Escape')
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
  })

  test('renders the conciv_ui blocking card from the tool part and answers via uiReply', async ({page}) => {
    test.setTimeout(120_000)
    await openPage(page)
    await openPanel(page)
    kit.harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: "return await external_conciv_ui({kind: 'confirm', question: 'Proceed with the change?'})",
    })
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('ask me something')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByText('Proceed with the change?')).toBeVisible({timeout: 30_000})
    await page.getByRole('button', {name: 'Approve'}).click()
    await expect(page.getByRole('status').getByText('yes')).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('button', {name: 'Approve'})).toBeHidden({timeout: 30_000})
  })

  test('renders catalog and code-mode parts without blanking the transcript', async ({page}) => {
    await openPage(page)
    await openPanel(page)
    kit.harness.script.scriptToolCall('catalog', {search: 'weather'}, {blocking: false})
    kit.harness.script.scriptCustomEvent('code_mode:console', {stream: 'stdout', text: 'hello from code mode'})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('discover and run some tools')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    const announced = await page.getByRole('alert').allTextContents()
    expect(announced.every((text) => text.trim() === '')).toBe(true)
  })

  test('renders the new tool cards for results that do not match their payload schema', async ({page}) => {
    test.setTimeout(120_000)
    await openPage(page)
    await openPanel(page)
    kit.harness.script.scriptToolCall('execute_typescript', {typescriptCode: 'return 1'}, {blocking: false})
    kit.harness.script.scriptToolCall('catalog', {search: 'weather'}, {blocking: false})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await sendAndRevealThought(page, 'run some code')
    await expect(page.getByRole('button', {name: /run code return 1/})).toBeVisible({timeout: 30_000})
    await expect(page.getByText('return 1').first()).toBeVisible({timeout: 30_000})
    await sendAndRevealThought(page, 'now check the catalog')
    await expect(page.getByText('Capability catalog').last()).toBeVisible({timeout: 30_000})
    await expect(input).toHaveText('')
    const announced = await page.getByRole('alert').allTextContents()
    expect(announced.every((text) => text.trim() === '')).toBe(true)
  })
})

test.describe('embed at a phone viewport', () => {
  test.use({viewport: PHONE_VIEWPORT})

  let phoneKit: EmbedKit
  let phoneHost: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    phoneKit = await bootEmbedKit({text: ASSISTANT_TEXT, models: HARNESS_MODELS})
    phoneHost = await serveHost((url) =>
      hostPage({
        apiBase: phoneKit.base,
        widget: '{"quickTerminal":false}',
        backdrop: url.searchParams.get('backdrop'),
      }),
    )
  })

  test.afterAll(async () => {
    await phoneHost.close()
    await phoneKit.cleanup()
  })

  test('paints an opaque sheet so the host page never shows through', async ({page}) => {
    const shootOver = async (backdrop: string): Promise<Buffer> => {
      expect(await setNavigation(phoneKit, [{href: '/'}])).toBe(true)
      await page.goto(`${phoneHost.base}/?backdrop=${backdrop}`, {waitUntil: 'domcontentloaded'})
      await openPanel(page)
      return page.screenshot({animations: 'disabled', clip: SHEET_INTERIOR_CLIP})
    }
    const patterned = await shootOver('light-stripes')
    const repeated = await shootOver('light-stripes')
    expect(repeated.equals(patterned)).toBe(true)
    const inverted = await shootOver('dark-stripes')
    expect(inverted.equals(patterned)).toBe(true)
  })

  test('opens as a full-screen sheet with the launcher hidden and the composer reachable', async ({page}) => {
    test.setTimeout(120_000)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toHaveCount(0, {timeout: 30_000})
    await sendMessage(page, 'hi there', ASSISTANT_TEXT)
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
  })

  test.describe('a narrower phone width', () => {
    test.use({viewport: {width: 320, height: 800}})

    test('keeps Stop and Send inside the sheet on a narrow phone while a run streams', async ({page}) => {
      await page.goto(host.base, {waitUntil: 'domcontentloaded'})
      await openPanel(page)
      kit.harness.script.hold()
      const send = page.getByRole('button', {name: 'Send message'})
      const stop = page.getByRole('button', {name: 'Stop generating'})
      await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('a question that keeps running')
      await send.click()
      await expect(stop).toBeVisible({timeout: 30_000})
      await expect(page.getByRole('button', {name: 'Select model'})).toBeInViewport({ratio: 1, timeout: 5_000})
      await expect(stop).toBeInViewport({ratio: 1, timeout: 5_000})
      await expect(send).toBeInViewport({ratio: 1, timeout: 5_000})
      kit.harness.script.release()
      await expect(stop).toBeHidden({timeout: 30_000})
    })
  })
})

test.describe('embed settings', () => {
  test('modal disabled renders no fab', async ({page}) => {
    const disabledHost = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"modal": false}'}))
    observedPage(page)
    await page.goto(disabledHost.base, {waitUntil: 'domcontentloaded'})
    await page.getByRole('status').waitFor({state: 'attached', timeout: 15_000})
    expect(await page.getByRole('button', {name: 'Open conciv chat'}).count()).toBe(0)
    await disabledHost.close()
  })
})
