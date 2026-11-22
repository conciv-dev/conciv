import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots, holdEngineCall, loginWidget} from '@conciv/e2e-utils/widget'

test.describe('stopping before the engine has the run', () => {
  test('the user presses Stop while the engine holds the send, the engine then refuses it, and the text comes back to the composer with no notice and no message in the thread', async ({
    page,
  }) => {
    const failures = collectFailures(page)
    await loginWidget(page)
    await expectWidgetBoots(page, failures)
    const send = await holdEngineCall(page, ['chat', 'send'])
    await page.reload({waitUntil: 'domcontentloaded'})

    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.click()
    await expect(composer).toBeFocused()
    await composer.pressSequentially('First task')
    await composer.press('Enter')
    await send.arrived
    await page.getByRole('button', {name: 'Stop generating'}).click()
    send.release('INTERNAL_SERVER_ERROR')

    await expect(composer).toHaveText('First task')
    await expect(page.getByRole('article', {name: 'You: First task'})).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
