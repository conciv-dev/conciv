import {test} from '@playwright/test'
import {bootEmbedKit, type EmbedKit} from '../../helpers/boot.js'
import {hostPage} from '../../helpers/host.js'
import {serveHost} from '@conciv/extension-testkit/serve-host'

export type WidgetSuite = {
  kit: () => EmbedKit
  host: () => {base: string; close: () => Promise<void>}
}

export function setupWidgetSuite(options: Parameters<typeof bootEmbedKit>[0] = {}): WidgetSuite {
  let kit: EmbedKit
  let host: {base: string; close: () => Promise<void>}

  test.beforeEach(async () => {
    kit = await bootEmbedKit(options)
    host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
  })

  test.afterEach(async () => {
    await host.close()
    await kit.cleanup()
  })

  return {kit: () => kit, host: () => host}
}
