import {expect, test} from '@playwright/test'
import {loginWidget} from '@conciv/e2e-utils/widget'

test.describe('the widget in a browser that refuses site storage', () => {
  test('the user signs in and types a draft, the draft is saved to the engine, and after a reload the widget asks to authorize again and the draft comes back from the engine', async ({
    page,
  }) => {
    const draft = 'a draft only the engine keeps'
    const longerDraft = `${draft}, written just before closing the panel`
    const engineSaw = (text: string) => {
      const seen = Promise.withResolvers<void>()
      page.on('websocket', (socket) =>
        socket.on('framesent', ({payload}) => {
          if (String(payload).includes(text)) seen.resolve()
        }),
      )
      return seen.promise
    }
    const draftSaved = engineSaw(draft)
    const longerDraftSaved = engineSaw(longerDraft)

    await loginWidget(page)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.fill(draft)
    await draftSaved

    await composer.fill(longerDraft)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await expect(composer).not.toBeVisible()
    await longerDraftSaved

    await page.reload({waitUntil: 'domcontentloaded'})
    await expect(page.getByRole('button', {name: 'Unauthorized. Authorize conciv'})).toBeVisible()

    await loginWidget(page)
    await page.getByRole('button', {name: /conciv chat$/}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toHaveText(longerDraft)
  })
})
