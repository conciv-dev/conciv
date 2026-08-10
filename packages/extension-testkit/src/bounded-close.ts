import {afterAll, beforeAll} from 'vitest'
import {chromium, type Browser} from 'playwright'

const DEFAULT_CLOSE_DEADLINE_MS = 30_000

export const BROWSER_CLOSE_TIMEOUT_MS = 30_000
export const SUITE_HOOK_TIMEOUT_MS = 60_000

export async function boundedClose(
  close: () => Promise<void>,
  label: string,
  timeoutMs = DEFAULT_CLOSE_DEADLINE_MS,
): Promise<void> {
  const timerHolder: {timer: ReturnType<typeof setTimeout> | undefined} = {timer: undefined}
  const timedOut = new Promise<never>((_resolve, reject) => {
    timerHolder.timer = setTimeout(() => reject(new Error(`${label} did not close within ${timeoutMs}ms`)), timeoutMs)
  })
  try {
    await Promise.race([close(), timedOut])
  } finally {
    clearTimeout(timerHolder.timer)
  }
}

export async function settleTeardown(steps: Array<() => Promise<void>>): Promise<void> {
  const results = await Promise.allSettled(steps.map((step) => step()))
  const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (firstFailure) throw firstFailure.reason
}

export type SuiteTeardownResources = {
  browser: () => Promise<void>
  host: () => Promise<void>
  kit: () => Promise<void>
}

export function suiteTeardown(resources: SuiteTeardownResources): () => Promise<void> {
  return () =>
    settleTeardown([
      () => boundedClose(resources.browser, 'browser.close', BROWSER_CLOSE_TIMEOUT_MS),
      resources.host,
      resources.kit,
    ])
}

export type ManagedBrowserSuite<Kit, Host> = {
  browser: () => Browser
  kit: () => Kit
  host: () => Host
}

export function manageBrowserSuite<
  Kit extends {cleanup: () => Promise<void>},
  Host extends {close: () => Promise<void>},
>(boot: () => Promise<{kit: Kit; host: Host}>): ManagedBrowserSuite<Kit, Host> {
  let browser: Browser
  let kit: Kit
  let host: Host

  beforeAll(async () => {
    browser = await chromium.launch()
    const booted = await boot()
    kit = booted.kit
    host = booted.host
  }, SUITE_HOOK_TIMEOUT_MS)

  afterAll(
    suiteTeardown({
      browser: async () => await browser?.close(),
      host: () => host.close(),
      kit: () => kit.cleanup(),
    }),
    SUITE_HOOK_TIMEOUT_MS,
  )

  return {browser: () => browser, kit: () => kit, host: () => host}
}
