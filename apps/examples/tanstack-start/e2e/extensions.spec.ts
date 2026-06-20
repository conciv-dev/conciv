import {test, expect} from '@playwright/test'

// A file dropped in mandarax/extensions/ is discovered, injected, and applied to the live widget
// with no manual wiring. blue.ts sets --pw-accent; the FAB resolves it from the shadow root.
test('a file-based extension applies its theme override to the widget', async ({page}) => {
  await page.goto('/')
  const fab = page.getByRole('button', {name: 'Open mandarax chat'})
  await expect(fab).toBeVisible({timeout: 30_000})
  const accent = await fab.evaluate((el) => getComputedStyle(el).getPropertyValue('--pw-accent').trim())
  expect(accent).toBe('rgb(37, 99, 235)')
})
