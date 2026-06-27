import {test, expect} from '@playwright/test'

// Opening the whiteboard boots Jazz's browser runtime (a module Worker; the WASM CRDT). On a local
// devtool every identity is trusted, so the browser client must be able to write — if it is denied
// (CatalogueWriteDenied), Jazz retries the write forever, pinning the tab's CPU and never persisting
// drawings. This guards both the worker boot AND that writes are authorized (no denial retry loop).
test('whiteboard Jazz runtime boots and writes without a permission-denied retry loop', async ({page}) => {
  const denials: string[] = []
  const runtimeErrors: string[] = []
  const failedRequests: string[] = []
  page.on('console', (message) => {
    if (/CatalogueWriteDenied|WriteDenied|permission denied/i.test(message.text())) denials.push(message.text())
  })
  page.on('pageerror', (error) => {
    if (/jazz-leader-tab|Worker load error|Failed to construct '(Shared)?Worker'/i.test(error.message))
      runtimeErrors.push(error.message)
  })
  page.on('requestfailed', (request) => {
    if (/worker|jazz|wasm/i.test(request.url())) failedRequests.push(`${request.failure()?.errorText} ${request.url()}`)
  })

  await page.goto('/')
  await page.getByRole('button', {name: 'Open mandarax chat'}).click()
  const whiteboard = page.getByRole('button', {name: 'Open the whiteboard canvas'}).first()
  await expect(whiteboard).toBeVisible({timeout: 30_000})
  await whiteboard.click()
  await expect(page.locator('.excalidraw').first()).toBeVisible({timeout: 30_000})

  // Let the worker boot and the first sync round happen; a denial retry loop fires repeatedly here.
  await page.waitForTimeout(10_000)

  expect(failedRequests, 'no failed worker/wasm requests').toEqual([])
  expect(runtimeErrors, 'no Jazz worker/leader-election errors').toEqual([])
  expect(denials, 'no CatalogueWriteDenied / permission-denied retry loop').toEqual([])
})
