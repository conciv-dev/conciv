import {expect, test} from '@conciv/e2e-utils/fixtures'

test.describe('a CLI that is not signed in', () => {
  for (const cli of ['Claude', 'Codex', 'Gemini CLI']) {
    test(`a message to ${cli}, switched to in the model menu, ends in a visible error, never a hang`, async ({
      page,
    }) => {
      await page.getByRole('button', {name: 'More composer actions'}).click()
      await page.getByRole('menuitem', {name: 'Start a new session'}).click()
      await expect(page.getByRole('status', {name: 'conciv announcements'})).toHaveText('Started a new session')
      await page.getByRole('button', {name: 'Model: Pi'}).click()
      await page
        .getByRole('option')
        .filter({hasText: `(${cli})`})
        .first()
        .click()
      await expect(page.getByRole('button', {name: new RegExp(`^Model: .+ \\(${cli}\\)`)})).toBeVisible()
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.fill('Reply with a short greeting')
      await composer.press('Enter')
      await expect(page.getByRole('alert').filter({has: page.getByRole('button', {name: 'Retry'})})).toBeVisible()
      await expect(page.getByRole('button', {name: 'Stop generating'})).not.toBeVisible()
    })
  }
})
