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
import {defineClient} from '@mandarax/api-client'
import {parseWidgetSettings, type WidgetSettings} from './client/widget-settings.js'
import {applyThemeOverrides} from './lib/theme.js'
import {builtinToolCards} from '@mandarax/ui-kit-chat-tools'
import type {ToolCardEntry} from '@mandarax/protocol/tool-view-types'
import {collectToolRenderers, installClientApi, type AnyExtension} from '@mandarax/extension'
import {makeWidgetClientApi} from './page/client-api.js'
import type {Refs} from './page/page-snapshot.js'
import {type ExtensionInstance} from './extension/extension-slots.js'
import highlight from './extensions/highlight.js'

// Entry: create the open Shadow DOM, probe the dev server, and mount the Solid chat agent +
// page-bus when the mandarax routes are live. Auto-mounts on load; also exports mountWidget.

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

declare global {
  interface Window {
    __MANDARAX_API_BASE__?: string
    // Test seam (browser IT): the live page driver, for driving React verbs against real fibers
    // without a running dev server. Same driver the page-bus uses (one console buffer / registry).
    __MANDARAX_PAGE_DRIVER__?: PageDriver
    // Test seam (browser IT): the react-bridge module, for driving introspection verbs against real
    // fibers directly without a running dev server.
    __MANDARAX_REACT_BRIDGE__?: typeof reactBridge
  }
}

// apiBase from a window global (Next has no HTML-injection seam) or the meta tag (Vite path).
function resolveApiBase(): string {
  return window.__MANDARAX_API_BASE__ ?? metaContent('pw-api-base')
}

// Layout settings injected as the pw-widget meta JSON. Both layouts default on.
function resolveWidget(): WidgetSettings {
  return parseWidgetSettings(metaContent('pw-widget'))
}

// The plugin's client entry imports this and passes the discovered extensions (built-ins + the user's
// mandarax/extensions/*). Their server halves were collapsed by the bundler; here their theme applies
// and their Component renders into the surface slots. Tool renderers compose ahead of the built-ins so
// an extension can override a built-in card by name.
export function mountWidget(extensions: AnyExtension[]): void {
  if (document.querySelector('[data-mandarax-root]')) return
  // Install the RDT hook before the host app's React initializes (so inspect/override work).
  installReactBridge()
  window.__MANDARAX_REACT_BRIDGE__ = reactBridge
  const {root} = createShadowRoot()
  const apiBase = resolveApiBase()
  // One driver, shared by the page-bus and the test seam, so console-patching + registry happen once.
  const driver = makeDomPageDriver()
  window.__MANDARAX_PAGE_DRIVER__ = driver
  const settings = resolveWidget()
  // Built-in extensions ride ahead of the discovered ones. The page ClientApi is installed before any
  // client phase runs and each extension's .client() runs here at mount — server-independent — so a
  // built-in like highlight works even when the chat probe below fails (plain app, no mandarax server).
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
  // Chat + page-bus only exist on the mandarax dev server. Probe the non-session /models route: a 2xx
  // means chat is mounted (and carries the harness identity that gates the launch button). A throw
  // (404 / network) → a plain app, so the widget shows nothing.
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
    .catch(() => {
      // No /models route (older core / non-chat server) → mount nothing.
    })
}
