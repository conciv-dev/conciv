import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {chromium, type Browser, type Page} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './helpers/boot.js'
import {hostPage, serveHost} from './helpers/host.js'
import {openPanel} from './helpers/panel.js'

const REPLY_LINES = Array.from({length: 30}, (_unused, index) => `Reply line ${index} keeps the transcript tall.`)
const ASSISTANT_TEXT = REPLY_LINES.join('\n\n')
const TAIL_LINE = REPLY_LINES[REPLY_LINES.length - 1] ?? ''
const QUESTIONS = ['first question', 'second question', 'third question']

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

function chatDialog(page: Page) {
  return page.getByRole('dialog', {name: 'conciv chat agent'})
}

async function tailWithinDialog(page: Page): Promise<boolean> {
  const dialogBox = await chatDialog(page).boundingBox()
  const tailBox = await page.getByText(TAIL_LINE).last().boundingBox()
  if (!dialogBox || !tailBox) return false
  return tailBox.y >= dialogBox.y && tailBox.y + tailBox.height <= dialogBox.y + dialogBox.height
}

async function wheelOverTranscript(page: Page, deltaY: number): Promise<void> {
  const box = await chatDialog(page).boundingBox()
  if (!box) throw new Error('chat dialog has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3)
  await page.mouse.wheel(0, deltaY)
}

describe('session switch scroll position', () => {
  it('returning to a session lands the transcript at the latest message', async () => {
    const page = await browser.newPage()
    await page.goto(host.base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    for (const question of QUESTIONS) {
      await input.fill(question)
      await page.getByRole('button', {name: 'Send message'}).click()
      await expect.poll(() => page.getByText(question).first().isVisible(), {timeout: 30_000}).toBe(true)
      await expect.poll(() => tailWithinDialog(page), {timeout: 30_000}).toBe(true)
    }

    const latest = page.getByRole('button', {name: 'Scroll to bottom'})
    await wheelOverTranscript(page, -1200)
    await expect.poll(() => latest.isVisible(), {timeout: 10_000}).toBe(true)
    await latest.click()
    await expect.poll(() => latest.isVisible(), {timeout: 10_000}).toBe(false)

    const sessions = await kit.rpc.sessions.list(undefined)
    const chatted = sessions[0]
    if (!chatted) throw new Error('expected the chatted session to exist')
    await kit.rpc.sessions.rename({sessionId: chatted.id, title: 'alpha'})

    await page.getByRole('button', {name: 'Start a new session'}).click()
    await expect.poll(() => page.getByLabel('Session: New session').isVisible(), {timeout: 10_000}).toBe(true)

    await page.getByLabel('Session: New session').click()
    await page.getByRole('option', {name: /^alpha/}).click()

    await expect.poll(() => page.getByText('third question').first().isVisible(), {timeout: 30_000}).toBe(true)
    await expect.poll(() => tailWithinDialog(page), {timeout: 10_000}).toBe(true)
    await page.waitForTimeout(600)
    expect(await tailWithinDialog(page)).toBe(true)

    await page.close()
  })
})
