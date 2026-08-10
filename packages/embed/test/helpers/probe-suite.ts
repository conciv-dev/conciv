import type {Browser} from 'playwright'
import {manageBrowserSuite} from '@conciv/extension-testkit/bounded-close'
import {bootEmbedKit, type EmbedKit} from './boot.js'
import {serveHost, wsProbeHostPage} from './host.js'

export type ProbeSuite = {
  browser: () => Browser
  kit: () => EmbedKit
  host: () => {base: string; close: () => Promise<void>}
  socketUrl: () => string
}

export function setupWsProbeSuite(): ProbeSuite {
  const suite = manageBrowserSuite<EmbedKit, {base: string; close: () => Promise<void>}>(async () => {
    const kit = await bootEmbedKit()
    const host = await serveHost(() => wsProbeHostPage())
    return {kit, host}
  })

  return {
    browser: suite.browser,
    kit: suite.kit,
    host: suite.host,
    socketUrl: () => `${suite.kit().wsBase}/rpc-ws`,
  }
}
