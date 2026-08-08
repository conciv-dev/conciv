import {describe, expect, it} from 'vitest'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const suite = setupWidgetSuite()

describe('draft persistence carries the caret offsets', () => {
  it('persists the draft text with the caret position after the debounce', async () => {
    const page = await suite.browser().newPage()
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await input.click()
    await input.pressSequentially('hello!')
    for (let step = 0; step < 6; step += 1) await input.press('ArrowLeft')
    const persisted = page.waitForResponse(
      (response) =>
        response.url().includes('/rpc/drafts/set') && (response.request().postData() ?? '').includes('say hello!'),
      {timeout: 30_000},
    )
    await input.pressSequentially('say ')
    await persisted

    const state = await suite.kit().rpc.navigation.get(undefined)
    const panelEntry = state?.entries.find((entry) => entry.href.startsWith('/panel/'))
    const sessionId = (panelEntry?.href.split('/')[2] ?? '').split('?')[0] ?? ''
    expect(await suite.kit().rpc.drafts.get({sessionId})).toMatchObject({
      text: 'say hello!',
      selectionStart: 4,
      selectionEnd: 4,
    })
    await page.close()
  })
})
