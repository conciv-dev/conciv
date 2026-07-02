import {createShadowRoot} from './shadow.js'
import {createWidgetShell} from './shell/widget-shell.js'
import {chatPanelDef} from './chat/chat-panel.js'
import {elementPickerAction} from './page/react-grab/picker-action.js'
import {newSessionAction} from './composer/new-session-action.js'
import {compactAction} from './composer/compact-action.js'
import {makeOpenInTerminalAction} from './composer/open-in-terminal-action.js'
import {modelSelectorControl} from './composer/model-selector.js'
import {initPageBus} from './page/page-bus.js'
import {makeDomPageDriver, type PageDriver} from './page/page-driver.js'
import {installReactBridge} from './page/react-bridge.js'
import * as reactBridge from './page/react-bridge.js'
import {createSignal} from 'solid-js'
import {defineClient} from '@conciv/api-client'
import {parseWidgetSettings, type WidgetSettings} from './client/widget-settings.js'
import {applyThemeOverrides} from './lib/theme.js'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {collectToolRenderers, installClientApi, type AnyExtension} from '@conciv/extension'
import {makeWidgetClientApi} from './page/client-api.js'
import type {Refs} from './page/page-snapshot.js'
import {type ExtensionInstance} from './extension/extension-slots.js'
import highlight from './extensions/highlight.js'

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string

    __CONCIV_PAGE_DRIVER__?: PageDriver

    __CONCIV_REACT_BRIDGE__?: typeof reactBridge
  }
}

function resolveApiBase(): string {
  return window.__CONCIV_API_BASE__ ?? metaContent('pw-api-base')
}

function resolveWidget(): WidgetSettings {
  return parseWidgetSettings(metaContent('pw-widget'))
}

export function mountWidget(extensions: AnyExtension[]): void {
  if (document.querySelector('[data-conciv-root]')) return

  installReactBridge()
  window.__CONCIV_REACT_BRIDGE__ = reactBridge
  const {root} = createShadowRoot()
  const apiBase = resolveApiBase()

  const driver = makeDomPageDriver()
  window.__CONCIV_PAGE_DRIVER__ = driver
  const settings = resolveWidget()

  const allExtensions: AnyExtension[] = [highlight, ...extensions]
  const refs: Refs = {map: new Map(), n: 0}
  const [activeSession, setActiveSession] = createSignal<string | null>(null)
  installClientApi(makeWidgetClientApi({apiBase, refs, activeSession}))
  const instances: ExtensionInstance[] = allExtensions.map((extension) => {
    const result = extension.__client?.()
    return {extension, clientValue: result?.value ?? {}, dispose: result?.dispose}
  })
  for (const extension of allExtensions) if (extension.theme) applyThemeOverrides(root, extension.theme)
  const tools = (): ToolCardEntry[] => [...collectToolRenderers(allExtensions), ...builtinToolCards]

  void defineClient({apiBase})
    .models()
    .then((models) => {
      const shell = createWidgetShell({settings})
      shell.registerPanel(chatPanelDef(apiBase, models.harness.id, tools, instances, setActiveSession))
      shell.registerComposerAction(elementPickerAction)
      shell.registerComposerAction(newSessionAction)
      shell.registerComposerAction(compactAction)
      if (models.harness.canLaunch) shell.registerComposerAction(makeOpenInTerminalAction(models.harness.name))
      shell.registerComposerControl(modelSelectorControl)
      shell.mount(root)
      initPageBus({apiBase, driver})
    })
    .catch(() => {})
}
