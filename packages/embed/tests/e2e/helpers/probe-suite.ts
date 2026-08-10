import {test} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../../helpers/boot.js'
import {serveHost, wsProbeHostPage} from '../../helpers/host.js'

export type ProbeSuite = {
  kit: () => EmbedKit
  host: () => {base: string; close: () => Promise<void>}
  socketUrl: () => string
}

export function setupWsProbeSuite(): ProbeSuite {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeAll(async () => {
    kit = await bootEmbedKit()
    host = await serveHost(() => wsProbeHostPage())
  })

  test.afterAll(async () => {
    await host.close()
    await kit.cleanup()
  })

  return {
    kit: () => kit,
    host: () => host,
    socketUrl: () => `${kit.wsBase}/rpc-ws`,
  }
}
