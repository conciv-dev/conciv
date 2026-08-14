import {test} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../../helpers/boot.js'
import {hostPage, serveHost} from '../../helpers/host.js'
import {proxyTo, type ProxyCore} from '../../helpers/proxy.js'

export type ProxiedEmbedSuite = {
  kit: () => EmbedKit
  core: () => ProxyCore
  host: () => {base: string; close: () => Promise<void>}
}

export function setupProxiedEmbedSuite(
  opts: {
    text?: string
    widget?: string
    proxy?: {blockUpgrades?: boolean; port?: number}
  } = {},
): ProxiedEmbedSuite {
  let kit: EmbedKit
  let core: ProxyCore
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    kit = await bootEmbedKit({text: opts.text})
    core = await proxyTo(kit.base, opts.proxy)
    host = await serveHost(() => hostPage({apiBase: core.base, widget: opts.widget ?? '{"quickTerminal":false}'}))
  })

  test.afterAll(async () => {
    await host.close()
    await core.close()
    await kit.cleanup()
  })

  return {
    kit: () => kit,
    core: () => core,
    host: () => host,
  }
}
