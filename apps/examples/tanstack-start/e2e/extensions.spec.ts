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

// deploy-button.tsx is a Solid-JSX extension in this React host app: the mandarax plugin compiles
// mandarax/extensions/** as a Solid zone, so its composer action (with an inline Solid icon) and its
// status line apply to the live widget.
test('a Solid-JSX extension adds a composer action and a status line', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Open mandarax chat'}).click()
  // The status slot renders in every widget pane (chat + quick terminal); scope to the chat agent.
  const chat = page.getByLabel('mandarax chat agent')
  await expect(chat.getByRole('button', {name: 'Deploy'})).toBeVisible({timeout: 30_000})
  await expect(chat.getByText('env: staging')).toBeVisible()
  await expect(chat.getByText('Blue theme active')).toBeVisible()
})
