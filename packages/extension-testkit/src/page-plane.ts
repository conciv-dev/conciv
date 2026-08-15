import type {Page} from 'playwright'
import {rpcObserverFor} from './rpc-observer.js'

const PAGE_QUERIES_PATH: readonly string[] = ['page', 'queries']
const SUBSCRIBE_TIMEOUT_MS = 30_000

export async function awaitPagePlaneSubscribed(page: Page, arrive: () => Promise<void>): Promise<void> {
  const subscribed = rpcObserverFor(page).completed({path: PAGE_QUERIES_PATH, timeout: SUBSCRIBE_TIMEOUT_MS})
  await Promise.all([arrive(), subscribed])
}
