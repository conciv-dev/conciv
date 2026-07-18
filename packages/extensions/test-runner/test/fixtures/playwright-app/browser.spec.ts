import {test, expect} from '@playwright/test'

test('renders content in a real browser', async ({page}) => {
  await page.setContent('<h1>conciv</h1>')
  await expect(page.getByRole('heading', {name: 'conciv'})).toBeVisible()
})
