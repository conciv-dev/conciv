import type {Page} from 'playwright'
import {expect} from 'playwright/test'
import {makeRpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

const HANDSHAKE_TIMEOUT_MS = 30_000

export async function completeConnectHandshake(
  page: Page,
  apiBase: string,
  session: string,
  showSession: () => Promise<void>,
): Promise<void> {
  await expect(page.getByRole('status', {name: 'connect pane ready'})).toBeVisible({timeout: HANDSHAKE_TIMEOUT_MS})
  await page.evaluate((base) => window.dispatchEvent(new CustomEvent('embedtest:connect', {detail: {base}})), apiBase)
  await showSession()
  const rpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
  await expect
    .poll(() => rpc.plugin.call({rpcId: 'experimental.page', method: 'sessions.attached', input: {}}), {
      timeout: HANDSHAKE_TIMEOUT_MS,
    })
    .toContain(session)
}
