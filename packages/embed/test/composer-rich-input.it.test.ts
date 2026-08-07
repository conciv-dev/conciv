import {describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright'
import recorderServer from '@conciv/extension-recorder'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const ASSISTANT_TEXT = 'Rich input reply'

const suite = setupWidgetSuite({
  text: ASSISTANT_TEXT,
  extensions: [recorderServer],
  commands: [
    {name: 'compact', description: 'Compact the conversation'},
    {name: 'config', description: 'Open configuration'},
  ],
})

const composer = (page: Page) => page.getByRole('textbox', {name: 'Message the conciv agent'})

async function openComposer(page: Page): Promise<void> {
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
  await composer(page).click()
}

async function pickSuggestion(page: Page, listName: string, optionName: string): Promise<void> {
  const listbox = page.getByRole('listbox', {name: listName})
  await expectLocator(listbox.getByRole('option', {name: optionName})).toBeVisible({timeout: 10_000})
  await expectLocator(listbox.getByRole('option', {name: optionName})).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expectLocator(listbox).toBeHidden({timeout: 10_000})
}

describe('the rich composer input in the live widget shadow DOM', () => {
  it('types multiline text with slash and mention chips and submits the exact directive string', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('please run ')
    await input.pressSequentially('/config')
    await pickSuggestion(page, 'Commands', '/config')

    await input.pressSequentially('then ')
    await input.pressSequentially('@recording_start')
    await pickSuggestion(page, 'Tools', '@recording_start')

    await page.keyboard.press('Shift+Enter')
    await input.pressSequentially('second line')

    const expected = 'please run /config then @recording_start \nsecond line'
    const sent = page.waitForRequest(
      (request) => request.url().includes('/rpc/chat/send') && (request.postData() ?? '').includes('please run'),
      {timeout: 30_000},
    )
    await page.getByRole('button', {name: 'Send message'}).click()
    const request = await sent
    expect(request.postData()).toContain(JSON.stringify(expected))
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expectLocator(input).toHaveText('')
    await page.close()
  })

  it('backspace removes a selected command chip atomically', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('/compact')
    await pickSuggestion(page, 'Commands', '/compact')
    await expectLocator(input).toHaveText('/compact')

    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expectLocator(input).toHaveText('')
    await page.close()
  })

  it('a failed send restores the full draft into the composer', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)

    suite.kit().harness.script.scriptError('the run collapsed')
    await input.pressSequentially('bring me back')
    await page.getByRole('button', {name: 'Send message'}).click()

    await expectLocator(page.getByRole('alert').filter({hasText: 'the run collapsed'})).toBeVisible({timeout: 30_000})
    await expectLocator(input).toHaveText('bring me back')
    await page.close()
  })

  it('a reload restores the draft as plain directive text with the caret at the end', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('ship ')
    await input.pressSequentially('/config')
    await pickSuggestion(page, 'Commands', '/config')
    await page.waitForResponse(
      (response) =>
        response.url().includes('/rpc/drafts/set') && (response.request().postData() ?? '').includes('ship /config'),
      {timeout: 30_000},
    )

    await page.reload({waitUntil: 'domcontentloaded'})
    const restored = composer(page)
    await expectLocator(restored).toHaveText('ship /config', {timeout: 30_000})

    await restored.click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await expectLocator(restored).toHaveText('ship /config !')

    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expectLocator(restored).toHaveText('ship /confi')
    await page.close()
  })

  it('Enter during IME composition never submits; Enter after the commit does', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)
    const cdp = await page.context().newCDPSession(page)

    await input.pressSequentially('hello')
    await cdp.send('Input.imeSetComposition', {text: 'ん', selectionStart: 1, selectionEnd: 1})
    await page.keyboard.press('Enter')
    await expectLocator(input).toHaveText(/hello/)

    await cdp.send('Input.insertText', {text: 'ん'})
    await expectLocator(input).toHaveText('helloん')
    await page.keyboard.press('Enter')

    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    const userMessages = page.locator('[data-role="user"]')
    await expectLocator(userMessages).toHaveCount(1)
    await expectLocator(userMessages.first()).toContainText('hello')
    await page.close()
  })

  it('the send button submits the committed draft when clicked during composition', async () => {
    const page = await suite.browser().newPage()
    await openComposer(page)
    const input = composer(page)
    const cdp = await page.context().newCDPSession(page)

    await input.pressSequentially('committed draft')
    await cdp.send('Input.imeSetComposition', {text: 'か', selectionStart: 1, selectionEnd: 1})
    await page.getByRole('button', {name: 'Send message'}).click()

    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    const userMessages = page.locator('[data-role="user"]')
    await expectLocator(userMessages).toHaveCount(1)
    await expectLocator(userMessages.first()).toContainText('committed draft')
    await page.close()
  })
})
