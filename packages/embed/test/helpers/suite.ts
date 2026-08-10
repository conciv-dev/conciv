import {afterAll, beforeAll} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './boot.js'
import {hostPage, serveHost} from './host.js'

export type WidgetSuite = {
  browser: () => Browser
  kit: () => EmbedKit
  host: () => {base: string; close: () => Promise<void>}
}

export function setupWidgetSuite(options: Parameters<typeof bootEmbedKit>[0] = {}): WidgetSuite {
  let browser: Browser
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  beforeAll(async () => {
    browser = await chromium.launch()
    kit = await bootEmbedKit(options)
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
  }, 60_000)

  afterAll(async () => {
    await browser.close()
    await host.close()
    await kit.cleanup()
  })

  return {browser: () => browser, kit: () => kit, host: () => host}
}
