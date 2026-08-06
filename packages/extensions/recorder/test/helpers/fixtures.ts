import {z} from 'zod'
import type {Page} from 'playwright-core'
import type {ExtensionTestApi} from '@conciv/extension-testkit'

export async function startLiveCapture(api: ExtensionTestApi): Promise<{captureId: string}> {
  const flushed = api.page.waitForRequest((request) => request.url().includes('/rpc/ext/recorder/flush'), {
    timeout: 20_000,
  })
  const started = z.object({captureId: z.string()}).parse(await api.callTool('recording_start', {}))
  await flushed
  return started
}

export async function addMarker(page: Page): Promise<string> {
  await page.getByRole('button', {name: 'Add marker'}).click()
  const marker = page.getByRole('button', {name: /^Marker \d+$/}).last()
  await marker.waitFor({state: 'visible', timeout: 10_000})
  const label = await marker.textContent()
  if (!label) throw new Error('marker label missing')
  return label
}
