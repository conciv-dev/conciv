import {test, expect} from '@playwright/test'

test('about page shows its heading', async ({page}) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', {name: 'A small starter with room to grow.'})).toBeVisible()
})
