import {test, expect} from '@playwright/test'

// Real browser: the `page` fixture launches chromium (no server needed — setContent).
test('renders content in a real browser', async ({page}) => {
  await page.setContent('<h1 id="hero">conciv</h1>')
  await expect(page.locator('#hero')).toHaveText('conciv')
})
