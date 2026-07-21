import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {openPanel} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Hello from conciv'

let browser: Browser
let kit: EmbedKit
let host: {base: string; close: () => Promise<void>}

beforeAll(async () => {
  browser = await chromium.launch()
  kit = await bootEmbedKit({text: ASSISTANT_TEXT})
  host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
}, 60_000)

afterAll(async () => {
  await browser.close()
  await host.close()
  await kit.cleanup()
})

beforeEach(async () => {
  await kit.rpc.navigation.set({entries: [{href: '/'}], index: 0})
})

async function openPage(): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(host.base, {waitUntil: 'domcontentloaded'})
  return page
}

describe('embed boots the conciv app against a real core', () => {
  it('canonicalizes a restored panel route that carries a raw harness session id', async () => {
    const rawHarnessId = '43548fd1-0000-4220-acf0-014b10b5815f'
    await kit.rpc.navigation.set({entries: [{href: `/panel/${rawHarnessId}`}], index: 0})
    const page = await openPage()
    await expect
      .poll(
        async () => {
          const persisted = await kit.rpc.navigation.get()
          return persisted?.entries[persisted.index]?.href ?? ''
        },
        {timeout: 30_000},
      )
      .toMatch(/^\/panel\/conciv_/)
    const adopted = await kit.rpc.sessions.resolve({id: rawHarnessId})
    const persisted = await kit.rpc.navigation.get()
    expect(persisted?.entries[persisted.index]?.href).toBe(`/panel/${adopted.sessionId}`)
    await page.close()
  })

  it('fab close is a shutter: reopening restores the same view without touching history', async () => {
    const page = await openPage()
    await openPanel(page)
    await page.getByRole('tab', {name: 'Terminal'}).click()
    await expect
      .poll(() => page.getByRole('tab', {name: 'Terminal'}).getAttribute('aria-selected'), {timeout: 30_000})
      .toBe('true')
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
      .toBe(false)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect
      .poll(() => page.getByRole('tab', {name: 'Terminal'}).getAttribute('aria-selected'), {timeout: 30_000})
      .toBe('true')
    await expect
      .poll(
        async () => {
          const persisted = await kit.rpc.navigation.get()
          return persisted?.entries.filter((entry) => entry.href.includes('/panel/')).length ?? 0
        },
        {timeout: 30_000},
      )
      .toBe(1)
    await page.close()
  })

  it('a reload restores the panel open on the same view', async () => {
    const first = await openPage()
    await openPanel(first)
    await first.getByRole('tab', {name: 'Terminal'}).click()
    await expect
      .poll(
        async () => {
          const persisted = await kit.rpc.navigation.get()
          return persisted?.entries[persisted.index]?.href ?? ''
        },
        {timeout: 30_000},
      )
      .toMatch(/\/terminal\?.*open=true/)
    await first.close()
    const second = await openPage()
    await expect
      .poll(() => second.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
      .toBe(true)
    await expect
      .poll(() => second.getByRole('tab', {name: 'Terminal'}).getAttribute('aria-selected'), {timeout: 30_000})
      .toBe('true')
    await second.close()
  })

  it('a reload after closing the panel boots shut', async () => {
    const first = await openPage()
    await openPanel(first)
    await expect
      .poll(
        async () => {
          const persisted = await kit.rpc.navigation.get()
          return persisted?.entries[persisted.index]?.href ?? ''
        },
        {timeout: 30_000},
      )
      .toContain('open=true')
    await first.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expect
      .poll(
        async () => {
          const persisted = await kit.rpc.navigation.get()
          return persisted?.entries[persisted.index]?.href ?? ''
        },
        {timeout: 30_000},
      )
      .not.toContain('open=true')
    await first.close()
    const second = await openPage()
    await expect
      .poll(() => second.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 30_000})
      .toBe(true)
    expect(await second.getByRole('dialog', {name: 'conciv chat agent'}).count()).toBe(0)
    await second.close()
  })

  it('renders the fab instantly and opens the panel', async () => {
    const page = await openPage()
    await expect
      .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 30_000})
      .toBe(true)
    await openPanel(page)
    await expect.poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible()).toBe(true)
    await page.close()
  })

  it('opening and closing the panel leaves the host page scroll position untouched', async () => {
    const page = await openPage()
    await page.evaluate(() => {
      document.body.style.minHeight = '4000px'
      window.scrollTo(0, 1200)
    })
    await openPanel(page)
    expect(await page.evaluate(() => window.scrollY)).toBe(1200)
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).press('Escape')
    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
      .toBe(false)
    expect(await page.evaluate(() => window.scrollY)).toBe(1200)
    await page.close()
  })

  it('sends a message and renders the assistant reply from the fake harness', async () => {
    const page = await openPage()
    await openPanel(page)
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('hi there')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.poll(() => page.getByText(ASSISTANT_TEXT).first().isVisible(), {timeout: 30_000}).toBe(true)
    await page.close()
  })

  it('shows Stop instead of Send while a run is streaming; typing stays enabled', async () => {
    const page = await openPage()
    await openPanel(page)
    kit.harness.script.hold()
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('long question')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect
      .poll(() => page.getByRole('button', {name: 'Stop generating'}).isVisible(), {timeout: 30_000})
      .toBe(true)
    await input.fill('still typing while it runs')
    expect(await input.inputValue()).toBe('still typing while it runs')
    kit.harness.script.release()
    await expect
      .poll(() => page.getByRole('button', {name: 'Stop generating'}).isVisible(), {timeout: 30_000})
      .toBe(false)
    await page.close()
  })

  it('Escape closes the panel back to the fab', async () => {
    const page = await openPage()
    await openPanel(page)
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).press('Escape')
    await expect
      .poll(() => page.getByRole('dialog', {name: 'conciv chat agent'}).isVisible(), {timeout: 30_000})
      .toBe(false)
    await expect.poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible()).toBe(true)
    await page.close()
  })

  it('renders the conciv_ui blocking card from the tool part and answers via uiReply', async () => {
    const page = await openPage()
    await openPanel(page)
    kit.harness.script.scriptToolCall('conciv_ui', {kind: 'confirm', question: 'Proceed with the change?'})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.fill('ask me something')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.poll(() => page.getByText('Proceed with the change?').isVisible(), {timeout: 30_000}).toBe(true)
    await page.getByRole('button', {name: 'Approve'}).click()
    await expect.poll(() => page.getByText('Answered.').isVisible(), {timeout: 30_000}).toBe(true)
    await page.close()
  })
})

describe('embed settings', () => {
  it('modal disabled renders no fab', async () => {
    const disabledHost = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"modal": false}'}))
    const page = await browser.newPage()
    await page.goto(disabledHost.base, {waitUntil: 'domcontentloaded'})
    await page.getByRole('status').waitFor({state: 'attached', timeout: 15_000})
    expect(await page.getByRole('button', {name: 'Open conciv chat'}).count()).toBe(0)
    await page.close()
    await disabledHost.close()
  })
})
