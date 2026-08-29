import type {Page} from 'playwright'
import {expect} from 'playwright/test'
import {makeRpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {observeRpc} from './rpc-observer.js'

const HANDSHAKE_TIMEOUT_MS = 30_000

export async function completeConnectHandshake(page: Page, apiBase: string, session: string): Promise<void> {
  await expect(page.getByRole('status', {name: 'connect pane ready'})).toBeVisible({timeout: HANDSHAKE_TIMEOUT_MS})
  const observer = observeRpc(page)
  const subscribed = observer.completed({path: ['page', 'queries'], timeout: HANDSHAKE_TIMEOUT_MS})
  await page.evaluate((base) => window.dispatchEvent(new CustomEvent('embedtest:connect', {detail: {base}})), apiBase)
  try {
    await subscribed
    const rpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
    await rpc.registry.call({name: 'page_text', input: {selector: 'html'}})
  } finally {
    observer.dispose()
  }
}
