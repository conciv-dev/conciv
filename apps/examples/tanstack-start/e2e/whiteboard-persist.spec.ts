import {test, expect, type Page} from '@playwright/test'

async function openWhiteboard(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open mandarax chat'}).click()
  const whiteboard = page.getByRole('button', {name: 'Open the whiteboard canvas'}).first()
  await expect(whiteboard).toBeVisible({timeout: 30_000})
  await whiteboard.click()
  await expect(page.locator('.excalidraw').first()).toBeVisible({timeout: 30_000})
}

// The browser client runs a memory-driver Jazz runtime: nothing persists in the tab. Durability lives
// on the localhost sync server. A drawn rectangle must therefore survive a full page reload, proving the
// element round-tripped to the server and re-synced into a fresh runtime.
test('a drawn rectangle survives a full page reload', async ({page}) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await openWhiteboard(page)

  const canvas = page.locator('.excalidraw').first()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const origin = box ?? {x: 0, y: 0, width: 0, height: 0}

  const cx = origin.x + origin.width / 2
  const cy = origin.y + origin.height / 2
  await page.mouse.click(cx, cy)
  const rectangleTool = page.getByRole('radio', {name: 'Rectangle'})
  await page.keyboard.press('r')
  await expect(rectangleTool).toBeChecked()
  await page.mouse.move(cx - 120, cy - 80)
  await page.mouse.down()
  await page.mouse.move(cx + 120, cy + 80, {steps: 12})
  await page.mouse.up()

  const deleteAction = page.getByRole('button', {name: 'Delete'})
  await expect(deleteAction, 'rectangle is created and selected').toBeVisible({timeout: 10_000})

  await page.reload()
  await openWhiteboard(page)

  const reloadedBox = (await page.locator('.excalidraw').first().boundingBox()) ?? origin
  const rcx = reloadedBox.x + reloadedBox.width / 2
  const rcy = reloadedBox.y + reloadedBox.height / 2
  const selectAll = process.platform === 'darwin' ? 'Meta+a' : 'Control+a'
  await expect(async () => {
    await page.mouse.click(rcx, rcy)
    await page.keyboard.press('Escape')
    await page.keyboard.press(selectAll)
    await expect(
      page.getByRole('button', {name: 'Delete'}),
      'rectangle re-synced from the server after reload',
    ).toBeVisible({timeout: 2_000})
  }).toPass({timeout: 25_000})
})
