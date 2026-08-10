import {afterAll, beforeAll} from 'vitest'
import {chromium, type Browser} from 'playwright'
import {bootEmbedKit, type EmbedKit} from './boot.js'
import {serveHost, wsProbeHostPage} from './host.js'

export type ProbeSuite = {
  browser: () => Browser
  kit: () => EmbedKit
  host: () => {base: string; close: () => Promise<void>}
  socketUrl: () => string
}

export function setupWsProbeSuite(): ProbeSuite {
  let browser: Browser
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  beforeAll(async () => {
    browser = await chromium.launch()
    kit = await bootEmbedKit()
    host = await serveHost(() => wsProbeHostPage())
  }, 60_000)

  afterAll(async () => {
    await browser.close()
    await host.close()
    await kit.cleanup()
  })

  return {
    browser: () => browser,
    kit: () => kit,
    host: () => host,
    socketUrl: () => `${kit.wsBase}/rpc-ws`,
  }
}
