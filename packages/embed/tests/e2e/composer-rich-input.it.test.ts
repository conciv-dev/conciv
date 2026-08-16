import {expect, test, type Page} from '@playwright/test'
import recorderServer from '@conciv/extension-recorder'
import {watchRpcWire} from '@conciv/extension-testkit/rpc-wire'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanelOnNewSession} from './helpers/panel.js'
import {untilPanelDraft} from './helpers/drafts.js'

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

const waitForDraftWrite = (sessionId: string, fragment: string) =>
  untilPanelDraft(suite.kit(), sessionId, (draft) => draft.text.includes(fragment))

async function openComposer(page: Page): Promise<string> {
  const sessionId = await openPanelOnNewSession(page, suite)
  const input = composer(page)
  await input.click()
  await expect(input).toHaveText('')
  return sessionId
}

async function pickSuggestion(page: Page, listName: string, optionName: string): Promise<void> {
  const listbox = page.getByRole('listbox', {name: listName})
  const option = listbox.getByRole('option', {name: optionName})
  await expect(option).toBeVisible({timeout: 10_000})
  await expect(option).toHaveAttribute('id', /.+/, {timeout: 10_000})
  const optionId = await option.getAttribute('id')
  if (!optionId) throw new Error(`option "${optionName}" in "${listName}" rendered without an id`)
  await expect(composer(page)).toHaveAttribute('aria-activedescendant', optionId, {timeout: 10_000})
  await page.keyboard.press('Enter')
  await expect(listbox).toBeHidden({timeout: 10_000})
}

test.describe('the rich composer input in the live widget shadow DOM', () => {
  test('types multiline text with slash and mention chips and submits the exact directive string', async ({
    page: fixturePage,
  }) => {
    test.setTimeout(180_000)
    const page = fixturePage
    const wire = watchRpcWire(page)
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
    const sent = wire.nextChatSend().then((send) => send.content)
    await page.getByRole('button', {name: 'Send message'}).click()
    expect(await sent).toBe(expected)
    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expect(input).toHaveText('')
  })

  test('backspace removes a selected command chip in two steps, never a partial directive', async ({page}) => {
    test.setTimeout(120_000)
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('/compact')
    await pickSuggestion(page, 'Commands', '/compact')
    await expect(input).toHaveText('/compact ')

    await page.keyboard.press('Backspace')
    await expect(input).toHaveText('/compact')

    await page.keyboard.press('Backspace')
    await expect(input).toHaveText('')
  })

  test('forward delete removes the chip ahead of the caret in one step', async ({page}) => {
    test.setTimeout(120_000)
    await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('/compact')
    await pickSuggestion(page, 'Commands', '/compact')
    await expect(input).toHaveText('/compact ')

    await page.keyboard.press('Home')
    await input.pressSequentially('x')
    await expect(input).toHaveText('x/compact ')
    await page.keyboard.press('Delete')
    await expect(input).toHaveText('x ')
  })

  test('Escape closes the typeahead first, cancels the run next, and closes the panel last', async ({page}) => {
    test.setTimeout(180_000)
    await openComposer(page)
    const input = composer(page)

    suite.kit().harness.script.hold()
    try {
      await input.pressSequentially('keep this running')
      await page.getByRole('button', {name: 'Send message'}).click()
      const stop = page.getByRole('button', {name: 'Stop generating'})
      await expect(stop).toBeVisible({timeout: 30_000})

      await input.click()
      await input.pressSequentially('/config')
      const listbox = page.getByRole('listbox', {name: 'Commands'})
      await expect(listbox.getByRole('option', {name: '/config'})).toBeVisible({timeout: 10_000})

      await page.keyboard.press('Escape')
      await expect(listbox).toBeHidden({timeout: 10_000})
      await expect(input).toHaveText('/config')
      await expect(stop).toBeVisible()
      await expect(panel(page)).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(stop).toBeHidden({timeout: 30_000})
      await expect(panel(page)).toBeVisible()
    } finally {
      suite.kit().harness.script.release()
    }

    await page.keyboard.press('Escape')
    await expect(panel(page)).toBeHidden({timeout: 30_000})
  })

  test('a failed send restores the full draft into the composer', async ({page}) => {
    test.setTimeout(90_000)
    await openComposer(page)
    const input = composer(page)

    suite.kit().harness.script.scriptError('the run collapsed')
    await input.pressSequentially('bring me back')
    await page.getByRole('button', {name: 'Send message'}).click()

    await expect(page.getByRole('alert', {name: 'the run collapsed'})).toBeVisible({timeout: 30_000})
    await expect(input).toHaveText('bring me back')
  })

  test('a reload restores the draft as plain directive text with the caret at the end', async ({page}) => {
    test.setTimeout(180_000)
    const sessionId = await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('ship ')
    await input.pressSequentially('/config')
    await pickSuggestion(page, 'Commands', '/config')
    await waitForDraftWrite(sessionId, 'ship /config')

    await page.reload({waitUntil: 'domcontentloaded'})
    const restored = composer(page)
    await expect(restored).toHaveText('ship /config ', {timeout: 30_000})

    await page.keyboard.type('!')
    await expect(restored).toHaveText('ship /config !')
  })

  test('a reload restores the caret where the draft left it, not at the end', async ({page}) => {
    test.setTimeout(90_000)
    const sessionId = await openComposer(page)
    const input = composer(page)

    await input.pressSequentially('hello world')
    for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowLeft')
    await input.pressSequentially('X')
    await expect(input).toHaveText('helloX world')
    await waitForDraftWrite(sessionId, 'helloX world')

    await page.reload({waitUntil: 'domcontentloaded'})
    const restored = composer(page)
    await expect(restored).toHaveText('helloX world', {timeout: 30_000})

    await page.keyboard.type('Y')
    await expect(restored).toHaveText('helloXY world')
  })

  test('Enter during IME composition never submits; Enter after the commit sends the composed text', async ({
    page: fixturePage,
  }) => {
    test.setTimeout(90_000)
    const page = fixturePage
    const wire = watchRpcWire(page)
    await openComposer(page)
    const input = composer(page)
    const cdp = await page.context().newCDPSession(page)

    await input.pressSequentially('hello')
    await cdp.send('Input.imeSetComposition', {text: 'ん', selectionStart: 1, selectionEnd: 1})
    await page.keyboard.press('Enter')
    await expect(input).toHaveText(/hello/)

    await cdp.send('Input.insertText', {text: 'ん'})
    await expect(input).toHaveText('helloん')
    const sent = wire.nextChatSend().then((send) => send.content)
    await page.keyboard.press('Enter')
    expect(await sent).toBe('helloん')

    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expect(page.getByText('helloん', {exact: true})).toBeVisible()
  })

  test('the send button submits the visible draft including pending composition text', async ({page: fixturePage}) => {
    test.setTimeout(90_000)
    const page = fixturePage
    const wire = watchRpcWire(page)
    await openComposer(page)
    const input = composer(page)
    const cdp = await page.context().newCDPSession(page)

    await input.pressSequentially('committed draft')
    await cdp.send('Input.imeSetComposition', {text: 'か', selectionStart: 1, selectionEnd: 1})
    await expect(input).toHaveText('committed draftか')
    const sent = wire.nextChatSend().then((send) => send.content)
    await page.getByRole('button', {name: 'Send message'}).click()
    expect(await sent).toBe('committed draftか')

    await expect(page.getByText(ASSISTANT_TEXT).first()).toBeVisible({timeout: 30_000})
    await expect(page.getByText('committed draftか', {exact: true})).toBeVisible()
  })
})
