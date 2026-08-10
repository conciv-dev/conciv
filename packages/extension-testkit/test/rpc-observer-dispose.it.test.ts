import {chromium} from 'playwright'
import {test, expect} from 'vitest'
import {launch} from '../src/launch.js'
import {observeRpc, rpcObserverFor} from '../src/rpc-observer.js'

const NATURAL_TIMEOUT_MS = 300
const DISPOSE_SETTLE_BUDGET_MS = 150

test('dispose fails the pending waiter immediately instead of leaving its timer to fire naturally', async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('about:blank')
  try {
    const observer = observeRpc(page)
    const pending = observer.completed({path: ['never', 'called'], timeout: NATURAL_TIMEOUT_MS})
    pending.catch(() => {})
    const disposedAt = Date.now()
    observer.dispose()
    await expect(pending).rejects.toThrow(/disposed/)
    expect(Date.now() - disposedAt).toBeLessThan(DISPOSE_SETTLE_BUDGET_MS)
  } finally {
    await browser.close()
  }
})

test('closing the launched page disposes its rpc observer and cancels pending waits', async () => {
  const {page, close} = await launch('about:blank')
  const observer = rpcObserverFor(page)
  const pending = observer.completed({path: ['never', 'called'], timeout: NATURAL_TIMEOUT_MS})
  pending.catch(() => {})
  await close()
  await expect(pending).rejects.toThrow(/disposed/)
})
