import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
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

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}
let longHost: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: ASSISTANT_TEXT, models: HARNESS_MODELS})
  host = await serveHost((url) =>
    hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', backdrop: url.searchParams.get('backdrop')}),
  )
  longHost = await serveHost(() =>
    hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}', body: LONG_HOST_BODY}),
  )
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await longHost.close()
  await kit.cleanup()
})

beforeEach(async () => {
  expect(await setNavigation(kit, [{href: '/'}])).toBe(true)
})

function observedPage(page: Page): Page {
  rpcObserverFor(page)
  return page
}

async function openPage(): Promise<Page> {
  const page = observedPage(await browser.newPage())
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  return page
}

async function sendAndRevealThought(page: Page, message: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(message)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expectLocator(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
  await page.getByText('Chain of Thought').last().click()
}

describe('embed boots the conciv app against a real core', () => {
  it('canonicalizes a restored panel route that carries a raw harness session id', async () => {
    const rawHarnessId = '43548fd1-0000-4220-acf0-014b10b5815f'
    expect(await setNavigation(kit, [{href: `/panel/${rawHarnessId}`}])).toBe(true)
    const page = observedPage(await browser.newPage())
    const canonicalized = waitForNavigationWrite(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await canonicalized
    expect(await currentHref(kit)).toMatch(/^\/panel\/conciv_/)
    const adopted = await kit.rpc.sessions.resolve({id: rawHarnessId})
    const persisted = await kit.rpc.navigation.get()
    expect(persisted?.entries[persisted.index]?.href).toBe(`/panel/${adopted.sessionId}`)
    await page.close()
  })

  it('a widget navigation write that lands after a newer one loses, even in flight', async () => {
    const page = observedPage(await browser.newPage())
    const held = await holdFirstNavigationWrite(page)
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await held.arrived

    expect(await setNavigation(kit, [{href: '/reset-while-the-widget-write-is-in-flight'}])).toBe(true)
    const landed = waitForNavigationWrite(page)
    held.release()
    await landed

    expect(await currentHref(kit)).toBe('/reset-while-the-widget-write-is-in-flight')
    await page.close()
  })

  it('a reloaded page outranks the previous page in-flight write when both clocks read the same', async () => {
    const frozen = Date.now()
    const before = observedPage(await browser.newPage())
    await freezeClock(before, frozen)
    const held = await holdFirstNavigationWrite(before)
    expect((await kit.rpc.navigation.set({entries: [{href: '/'}], index: 0, updatedAt: frozen + 5_000})).applied).toBe(
      true,
    )
    await before.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(before)
    await held.arrived

    const after = observedPage(await browser.newPage())
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
    await before.close()
    await after.close()
  })

  it('fab close is a shutter: reopening restores the same view without touching history', async () => {
    const page = await openPage()
    await openPanel(page)
    await page.getByRole('tab', {name: 'Terminal'}).click()
    await expectLocator(page.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true', {
      timeout: 30_000,
    })
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    const reopened = waitForNavigationWrite(page)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expectLocator(page.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true', {
      timeout: 30_000,
    })
    await reopened
    const persisted = await kit.rpc.navigation.get()
    expect(persisted?.entries.filter((entry) => entry.href.includes('/panel/'))).toHaveLength(1)
    await page.close()
  })

  it('a reload restores the panel open on the same view', async () => {
    const first = await openPage()
    await openPanel(first)
    const switched = waitForNavigationWriteCarrying(first, '/terminal')
    await first.getByRole('tab', {name: 'Terminal'}).click()
    await switched
    expect(await currentHref(kit)).toMatch(/\/terminal\?.*open=true/)
    await first.close()
    const second = await openPage()
    await expectLocator(second.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expectLocator(second.getByRole('tab', {name: 'Terminal'})).toHaveAttribute('aria-selected', 'true', {
      timeout: 30_000,
    })
    await second.close()
  })

  it('a reload after closing the panel boots shut', async () => {
    const first = observedPage(await browser.newPage())
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
    const second = await openPage()
    await expectLocator(second.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
    expect(await second.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(0)
    await second.close()
  })

  it('renders the fab instantly and opens the panel', async () => {
    const page = await openPage()
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
    await openPanel(page)
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible()
    await page.close()
  })

  it('opening and closing the panel keeps the host page where the reader scrolled it', async () => {
    const page = observedPage(await browser.newPage())
    await page.goto(longHost.base, {waitUntil: 'domcontentloaded'})
    const heading = page.getByRole('heading', {name: HOST_HEADING})
    const headingTop = async () => (await heading.boundingBox())?.y ?? Number.NaN
    const unscrolled = await headingTop()

    await page.mouse.wheel(0, unscrolled - 200)
    await expectLocator(heading).toBeInViewport({timeout: 30_000})
    const readerPosition = await headingTop()
    expect(readerPosition).toBeLessThan(unscrolled - 1000)

    await openPanel(page)
    expect(await headingTop()).toBe(readerPosition)

    await page.getByRole('textbox', {name: 'Message the conciv agent'}).press('Escape')
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    expect(await headingTop()).toBe(readerPosition)
    await page.close()
  })

  it('sends a message and renders the assistant reply from the fake harness', async () => {
    const page = await openPage()
    await openPanel(page)
    await sendMessage(page, 'hi there', ASSISTANT_TEXT)
    await page.close()
  })

  it('shows Stop instead of Send while a run is streaming; typing stays enabled', async () => {
    const page = await openPage()
    await openPanel(page)
    kit.harness.script.hold()
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('long question')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expectLocator(page.getByRole('button', {name: 'Stop generating'})).toBeVisible({timeout: 30_000})
    await input.fill('still typing while it runs')
    await expectLocator(input).toHaveText('still typing while it runs')
    kit.harness.script.release()
    await expectLocator(page.getByRole('button', {name: 'Stop generating'})).toBeHidden({timeout: 30_000})
    await page.close()
  })

  it('Escape closes the panel back to the fab', async () => {
    const page = await openPage()
    await openPanel(page)
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).press('Escape')
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    await page.close()
  })

  it('renders the conciv_ui blocking card from the tool part and answers via uiReply', async () => {
    const page = await openPage()
    await openPanel(page)
    kit.harness.script.scriptToolCall('conciv_ui', {kind: 'confirm', question: 'Proceed with the change?'})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('ask me something')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expectLocator(page.getByText('Proceed with the change?')).toBeVisible({timeout: 30_000})
    await page.getByRole('button', {name: 'Approve'}).click()
    await expectLocator(page.getByText('Answered.')).toBeVisible({timeout: 30_000})
    await page.close()
  })

  it('renders lazy-discovery and code-mode parts without blanking the transcript', async () => {
    const page = await openPage()
    await openPanel(page)
    kit.harness.script.scriptToolCall('__lazy__tool__discovery__', {query: 'weather'}, {blocking: false})
    kit.harness.script.scriptCustomEvent('code_mode:console', {stream: 'stdout', text: 'hello from code mode'})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('discover and run some tools')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    const announced = await page.getByRole('alert').allTextContents()
    expect(announced.every((text) => text.trim() === '')).toBe(true)
    await page.close()
  })

  it('renders the new tool cards for results that do not match their payload schema', async () => {
    const page = await openPage()
    await openPanel(page)
    kit.harness.script.scriptToolCall('execute_typescript', {typescriptCode: 'return 1'}, {blocking: false})
    kit.harness.script.scriptToolCall('__lazy__tool__discovery__', {query: 'weather'}, {blocking: false})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await sendAndRevealThought(page, 'run some code')
    await expectLocator(page.getByText('run code')).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByText('return 1').first()).toBeVisible({timeout: 30_000})
    await sendAndRevealThought(page, 'now load some tools')
    await expectLocator(page.getByText(/Loaded \d+ tools?/).last()).toBeVisible({timeout: 30_000})
    await expectLocator(input).toHaveText('')
    const announced = await page.getByRole('alert').allTextContents()
    expect(announced.every((text) => text.trim() === '')).toBe(true)
    await page.close()
  })
})

describe('embed at a phone viewport', () => {
  let phoneKit: EmbedKit
  let phoneHost: {base: string; close: () => Promise<void>}

  beforeAll(async () => {
    phoneKit = await bootEmbedKit({text: ASSISTANT_TEXT, models: HARNESS_MODELS})
    phoneHost = await serveHost((url) =>
      hostPage({
        apiBase: phoneKit.base,
        widget: '{"quickTerminal":false}',
        backdrop: url.searchParams.get('backdrop'),
      }),
    )
  }, 60_000)

  afterAll(async () => {
    await phoneHost.close()
    await phoneKit.cleanup()
  })

  it('paints an opaque sheet so the host page never shows through', async () => {
    const page = await browser.newPage({viewport: PHONE_VIEWPORT})
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
    await page.close()
  })

  it('opens as a full-screen sheet with the launcher hidden and the composer reachable', async () => {
    const page = await browser.newPage({viewport: PHONE_VIEWPORT})
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toHaveCount(0, {timeout: 30_000})
    await sendMessage(page, 'hi there', ASSISTANT_TEXT)
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expectLocator(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeHidden({timeout: 30_000})
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
    await page.close()
  })

  it('keeps Stop and Send inside the sheet on a narrow phone while a run streams', async () => {
    const page = await browser.newPage({viewport: {width: 320, height: 800}})
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)
    kit.harness.script.hold()
    const send = page.getByRole('button', {name: 'Send message'})
    const stop = page.getByRole('button', {name: 'Stop generating'})
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('a question that keeps running')
    await send.click()
    await expectLocator(stop).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByRole('button', {name: 'Select model'})).toBeInViewport({ratio: 1, timeout: 5_000})
    await expectLocator(stop).toBeInViewport({ratio: 1, timeout: 5_000})
    await expectLocator(send).toBeInViewport({ratio: 1, timeout: 5_000})
    kit.harness.script.release()
    await expectLocator(stop).toBeHidden({timeout: 30_000})
    await page.close()
  })
})

describe('embed settings', () => {
  it('modal disabled renders no fab', async () => {
    const disabledHost = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"modal": false}'}))
    const page = observedPage(await browser.newPage())
    await page.goto(disabledHost.base, {waitUntil: 'domcontentloaded'})
    await page.getByRole('status').waitFor({state: 'attached', timeout: 15_000})
    expect(await page.getByRole('button', {name: 'Open conciv chat'}).count()).toBe(0)
    await page.close()
    await disabledHost.close()
  })
})
