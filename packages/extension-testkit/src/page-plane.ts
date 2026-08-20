import type {Page} from 'playwright'
import {rpcObserverFor} from './rpc-observer.js'

const PAGE_QUERIES_PATH: readonly string[] = ['page', 'queries']
const SUBSCRIBE_TIMEOUT_MS = 30_000
const TRACK_TIMEOUT_MS = 10 * 60_000

function sessionIdOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  if (!('sessionId' in input) || typeof input.sessionId !== 'string') return undefined
  return input.sessionId
}

export async function awaitWidgetSessionId(page: Page, arrive: () => Promise<void>): Promise<string> {
  const observer = rpcObserverFor(page)
  const [, record] = await Promise.all([
    arrive(),
    observer.completed({path: PAGE_QUERIES_PATH, timeout: SUBSCRIBE_TIMEOUT_MS}),
  ])
  const sessionId = sessionIdOf(record.input)
  if (sessionId === undefined) throw new Error('the widget subscribed to page/queries without a sessionId input')
  return sessionId
}

export async function awaitPagePlaneSubscribed(page: Page, arrive: () => Promise<void>): Promise<void> {
  await awaitWidgetSessionId(page, arrive)
}

export function trackWidgetSessionId(page: Page): {latest: () => string | undefined} {
  const observer = rpcObserverFor(page)
  const state: {sessionId: string | undefined; disposed: boolean} = {sessionId: undefined, disposed: false}
  page.once('close', () => {
    state.disposed = true
  })
  const poll = (since: number): void => {
    if (state.disposed) return
    observer
      .completed({path: PAGE_QUERIES_PATH, since, timeout: TRACK_TIMEOUT_MS})
      .then((record) => {
        const sessionId = sessionIdOf(record.input)
        if (sessionId !== undefined) state.sessionId = sessionId
        poll(observer.mark())
      })
      .catch(() => {
        if (!state.disposed) poll(observer.mark())
      })
  }
  poll(observer.mark())
  return {latest: () => state.sessionId}
}
