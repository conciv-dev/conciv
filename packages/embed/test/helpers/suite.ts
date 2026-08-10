import type {Browser} from 'playwright'
import {manageBrowserSuite} from '@conciv/extension-testkit/bounded-close'
import {bootEmbedKit, type EmbedKit} from './boot.js'
import {hostPage, serveHost} from './host.js'

export type WidgetSuite = {
  browser: () => Browser
  kit: () => EmbedKit
  host: () => {base: string; close: () => Promise<void>}
}

export function setupWidgetSuite(options: Parameters<typeof bootEmbedKit>[0] = {}): WidgetSuite {
  return manageBrowserSuite<EmbedKit, {base: string; close: () => Promise<void>}>(async () => {
    const kit = await bootEmbedKit(options)
    const host = await serveHost(() => hostPage({apiBase: kit.base, widget: '{"quickTerminal":false}'}))
    return {kit, host}
  })
}
