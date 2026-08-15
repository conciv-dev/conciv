import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanelOnNewSession} from './helpers/panel.js'
import {untilPanelDraft} from './helpers/drafts.js'

const suite = setupWidgetSuite()

test.describe('draft persistence carries the caret offsets', () => {
  test('persists the draft text with the caret position after the debounce', async ({page}) => {
    test.setTimeout(90_000)
    const sessionId = await openPanelOnNewSession(page, suite)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.click()
    await input.pressSequentially('hello!')
    for (let step = 0; step < 6; step += 1) await input.press('ArrowLeft')
    await input.pressSequentially('say ')
    await untilPanelDraft(suite.kit(), sessionId, (draft) => draft.text === 'say hello!')

    expect(await suite.kit().rpc.drafts.get({sessionId})).toMatchObject({
      text: 'say hello!',
      selectionStart: 4,
      selectionEnd: 4,
    })
  })
})
