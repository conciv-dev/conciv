import {test, expect} from '@playwright/test'

// Full canvas-comments journey against the live app: open the overlay from the composer (which hides
// the chat), draw with Excalidraw, place a comment (persisted through core), and confirm it survives a
// reload and shows its thread. This is the end-to-end acceptance test the unit ITs couldn't give us.
test('open canvas, draw, comment, and the comment persists across reload', async ({page}) => {
  await page.goto('/')

  // Open the canvas from the chat composer.
  await page.getByRole('button', {name: 'Open mandarax chat'}).click({timeout: 30_000})
  await page.getByRole('button', {name: 'Canvas'}).click()

  // Overlay is up (its Close control shows) and the chat panel is hidden while the canvas is open.
  await expect(page.getByRole('button', {name: 'Close canvas'})).toBeVisible({timeout: 30_000})
  await expect(page.getByRole('button', {name: 'Open mandarax chat'})).toBeHidden()

  // Draw a rectangle with Excalidraw's own tools (the canvas is interactive by default).
  await page.keyboard.press('r')
  await page.mouse.move(420, 300)
  await page.mouse.down()
  await page.mouse.move(680, 470, {steps: 12})
  await page.mouse.up()

  // Place a comment: Comment mode -> click the canvas -> type -> Save.
  await page.getByRole('button', {name: 'Comment'}).click()
  await page.mouse.click(900, 320)
  const composer = page.getByPlaceholder('Leave a comment…')
  await expect(composer).toBeVisible()
  await composer.fill('does this persist?')
  await page.getByRole('button', {name: 'Save comment'}).click()

  // A pin appears for the new comment.
  await expect(page.getByRole('button', {name: /comment pin/i}).first()).toBeVisible({timeout: 10_000})

  // Reload, reopen the canvas — the pin rehydrates from core (durable, not just in-memory).
  await page.reload()
  await page.getByRole('button', {name: 'Open mandarax chat'}).click({timeout: 30_000})
  await page.getByRole('button', {name: 'Canvas'}).click()
  const pin = page.getByRole('button', {name: /comment pin/i}).first()
  await expect(pin).toBeVisible({timeout: 15_000})

  // Opening the pin shows its thread text.
  await pin.click()
  await expect(page.getByText('does this persist?')).toBeVisible()
})
