import {test, expect} from '@playwright/test'

test('home page shows the hero heading', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', {name: 'Start simple, ship quickly.'})).toBeVisible()
})

test('home page links to about', async ({page}) => {
  await page.goto('/')
  await page.getByRole('link', {name: 'About', exact: true}).first().click()
  await expect(page).toHaveURL(/\/about$/)
})
