import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'
import {panelSessionId} from './helpers/navigation.js'
import {untilPanelDraft} from './helpers/drafts.js'

const suite = setupWidgetSuite()

test.describe('draft persistence carries the caret offsets', () => {
  test('persists the draft text with the caret position after the debounce', async ({page}) => {
    test.setTimeout(90_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.click()
    await input.pressSequentially('hello!')
    for (let step = 0; step < 6; step += 1) await input.press('ArrowLeft')
    await input.pressSequentially('say ')
    await untilPanelDraft(suite.kit(), (draft) => draft.text === 'say hello!')

    const sessionId = await panelSessionId(suite.kit())
    expect(await suite.kit().rpc.drafts.get({sessionId})).toMatchObject({
      text: 'say hello!',
      selectionStart: 4,
      selectionEnd: 4,
    })
  })
})
