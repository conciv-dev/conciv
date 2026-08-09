import {describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright'
import {z} from 'zod'
import recorderServer from '@conciv/extension-recorder'
import {observeRpc, type RpcObserver} from '@conciv/extension-testkit/rpc-observer'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'
import {setNavigation} from './helpers/navigation.js'

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
const panel = (page: Page) => page.getByRole('dialog', {name: 'conciv chat agent'})

const sendInputSchema = z.object({content: z.string()})

async function observedPage(): Promise<{page: Page; observer: RpcObserver}> {
  const page = await suite.browser().newPage()
  return {page, observer: observeRpc(page)}
}

const waitForSend = (observer: RpcObserver): Promise<string> =>
  observer
    .completed({path: ['chat', 'send'], since: observer.mark(), timeout: 30_000})
    .then((call) => sendInputSchema.parse(call.input).content)

const waitForDraftWrite = (observer: RpcObserver, fragment: string) =>
  observer.completed({
    path: ['drafts', 'set'],
    input: {text: new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))},
    timeout: 30_000,
  })

async function openComposer(page: Page): Promise<void> {
  const {sessionId} = await suite.kit().rpc.sessions.create()
  expect(await setNavigation(suite.kit(), [{href: `/panel/${sessionId}`}])).toBe(true)
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
  const input = composer(page)
  await input.click()
  await expectLocator(input).toHaveText('')
}

async function pickSuggestion(page: Page, listName: string, optionName: string): Promise<void> {
  const listbox = page.getByRole('listbox', {name: listName})
  const option = listbox.getByRole('option', {name: optionName})
  await expectLocator(option).toBeVisible({timeout: 10_000})
  await expectLocator(option).toHaveAttribute('id', /.+/, {timeout: 10_000})
  const optionId = await option.getAttribute('id')
  if (!optionId) throw new Error(`option "${optionName}" in "${listName}" rendered without an id`)
  await expectLocator(composer(page)).toHaveAttribute('aria-activedescendant', optionId, {timeout: 10_000})
  await page.keyboard.press('Enter')
  await expectLocator(listbox).toBeHidden({timeout: 10_000})
}

describe('the rich composer input in the live widget shadow DOM', () => {
  it('types multiline text with slash and mention chips and submits the exact directive string', async () => {
    const {page, observer} = await observedPage()
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
    const sent = waitForSend(observer)
    await page.getByRole('button', {name: 'Send message'}).click()
    expect(await sent).toBe(expected)
    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expectLocator(input).toHaveText('')
    observer.dispose()
    await page.close()
  })

  it('backspace removes a selected command chip in two steps, never a partial directive', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('/compact')
    await pickSuggestion(page, 'Commands', '/compact')
    await expectLocator(input).toHaveText('/compact ')

    await page.keyboard.press('Backspace')
    await expectLocator(input).toHaveText('/compact')

    await page.keyboard.press('Backspace')
    await expectLocator(input).toHaveText('')
    observer.dispose()
    await page.close()
  })

  it('forward delete removes the chip ahead of the caret in one step', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('/compact')
    await pickSuggestion(page, 'Commands', '/compact')
    await expectLocator(input).toHaveText('/compact ')

    await page.keyboard.press('Home')
    await input.pressSequentially('x')
    await expectLocator(input).toHaveText('x/compact ')
    await page.keyboard.press('Delete')
    await expectLocator(input).toHaveText('x ')
    observer.dispose()
    await page.close()
  })

  it('Escape closes the typeahead first, cancels the run next, and closes the panel last', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)

    suite.kit().harness.script.hold()
    try {
      await input.pressSequentially('keep this running')
      await page.getByRole('button', {name: 'Send message'}).click()
      const stop = page.getByRole('button', {name: 'Stop generating'})
      await expectLocator(stop).toBeVisible({timeout: 30_000})

      await input.click()
      await input.pressSequentially('/config')
      const listbox = page.getByRole('listbox', {name: 'Commands'})
      await expectLocator(listbox.getByRole('option', {name: '/config'})).toBeVisible({timeout: 10_000})

      await page.keyboard.press('Escape')
      await expectLocator(listbox).toBeHidden({timeout: 10_000})
      await expectLocator(input).toHaveText('/config')
      await expectLocator(stop).toBeVisible()
      await expectLocator(panel(page)).toBeVisible()

      await page.keyboard.press('Escape')
      await expectLocator(stop).toBeHidden({timeout: 30_000})
      await expectLocator(panel(page)).toBeVisible()
    } finally {
      suite.kit().harness.script.release()
    }

    await page.keyboard.press('Escape')
    await expectLocator(panel(page)).toBeHidden({timeout: 30_000})
    observer.dispose()
    await page.close()
  })

  it('a failed send restores the full draft into the composer', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)

    suite.kit().harness.script.scriptError('the run collapsed')
    await input.pressSequentially('bring me back')
    await page.getByRole('button', {name: 'Send message'}).click()

    await expectLocator(page.getByRole('alert', {name: 'the run collapsed'})).toBeVisible({timeout: 30_000})
    await expectLocator(input).toHaveText('bring me back')
    observer.dispose()
    await page.close()
  })

  it('a reload restores the draft as plain directive text with the caret at the end', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('ship ')
    await input.pressSequentially('/config')
    await pickSuggestion(page, 'Commands', '/config')
    await waitForDraftWrite(observer, 'ship /config')

    await page.reload({waitUntil: 'domcontentloaded'})
    const restored = composer(page)
    await expectLocator(restored).toHaveText('ship /config ', {timeout: 30_000})

    await page.keyboard.type('!')
    await expectLocator(restored).toHaveText('ship /config !')
    observer.dispose()
    await page.close()
  })

  it('a reload restores the caret where the draft left it, not at the end', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('hello world')
    for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowLeft')
    await input.pressSequentially('X')
    await expectLocator(input).toHaveText('helloX world')
    await waitForDraftWrite(observer, 'helloX world')

    await page.reload({waitUntil: 'domcontentloaded'})
    const restored = composer(page)
    await expectLocator(restored).toHaveText('helloX world', {timeout: 30_000})

    await page.keyboard.type('Y')
    await expectLocator(restored).toHaveText('helloXY world')
    observer.dispose()
    await page.close()
  })

  it('Enter during IME composition never submits; Enter after the commit sends the composed text', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)
    const cdp = await page.context().newCDPSession(page)

    await input.pressSequentially('hello')
    await cdp.send('Input.imeSetComposition', {text: 'ん', selectionStart: 1, selectionEnd: 1})
    await page.keyboard.press('Enter')
    await expectLocator(input).toHaveText(/hello/)

    await cdp.send('Input.insertText', {text: 'ん'})
    await expectLocator(input).toHaveText('helloん')
    const sent = waitForSend(observer)
    await page.keyboard.press('Enter')
    expect(await sent).toBe('helloん')

    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByText('helloん', {exact: true})).toBeVisible()
    observer.dispose()
    await page.close()
  })

  it('the send button submits the visible draft including pending composition text', async () => {
    const {page, observer} = await observedPage()
    await openComposer(page)
    const input = composer(page)
    const cdp = await page.context().newCDPSession(page)

    await input.pressSequentially('committed draft')
    await cdp.send('Input.imeSetComposition', {text: 'か', selectionStart: 1, selectionEnd: 1})
    await expectLocator(input).toHaveText('committed draftか')
    const sent = waitForSend(observer)
    await page.getByRole('button', {name: 'Send message'}).click()
    expect(await sent).toBe('committed draftか')

    await expectLocator(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByText('committed draftか', {exact: true})).toBeVisible()
    observer.dispose()
    await page.close()
  })
})
