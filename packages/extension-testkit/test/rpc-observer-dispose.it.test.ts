import {expect} from 'vitest'
import {test} from '@conciv/browser-fixture'
import {launch} from '../src/launch.js'
import {observeRpc, rpcObserverFor} from '../src/rpc-observer.js'

const NATURAL_TIMEOUT_MS = 300

test('dispose fails the pending waiter immediately instead of leaving its timer to fire naturally', async ({
  browser,
}) => {
  const page = await browser.newPage()
  await page.goto('about:blank')
  try {
    const observer = observeRpc(page)
    const pending = observer.completed({path: ['never', 'called'], timeout: NATURAL_TIMEOUT_MS})
    pending.catch(() => {})
    observer.dispose()
    await expect(pending).rejects.toThrow(/disposed/)
  } finally {
    await page.close()
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

test('dispose does not leak an unhandled rejection for a wait nobody awaited, and an awaited wait still rejects', async ({
  browser,
}) => {
  const page = await browser.newPage()
  await page.goto('about:blank')
  try {
    const observer = observeRpc(page)
    observer.completed({path: ['abandoned', 'wait'], timeout: NATURAL_TIMEOUT_MS})
    const awaited = observer.completed({path: ['awaited', 'wait'], timeout: NATURAL_TIMEOUT_MS})

    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown): void => void unhandled.push(reason)
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      observer.dispose()
      await expect(awaited).rejects.toThrow(/disposed/)
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  } finally {
    await page.close()
  }
})
