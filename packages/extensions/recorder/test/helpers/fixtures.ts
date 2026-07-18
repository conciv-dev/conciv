import type {Page} from 'playwright-core'

export async function addMarker(page: Page): Promise<string> {
  await page.getByRole('button', {name: 'Add marker'}).click()
  const marker = page.getByRole('button', {name: /^Marker \d+$/}).last()
  await marker.waitFor({state: 'visible', timeout: 10_000})
  const label = await marker.textContent()
  if (!label) throw new Error('marker label missing')
  return label
}
