import {createShadowRoot} from './shadow.js'
import {createWidgetShell} from './widget-shell.js'
import {chatPanelDef} from './chat-panel.js'
import {elementPickerAction} from './react-grab/picker-action.js'
import {newSessionAction} from './new-session-action.js'
import {compactAction} from './compact-action.js'
import {makeOpenInTerminalAction} from './open-in-terminal-action.js'
import {modelSelectorControl} from './model-selector.js'
import {initPageBus} from './page-bus.js'
import {makeDomPageDriver, type PageDriver} from './page-driver.js'
import {installReactBridge} from './react-bridge.js'
import {defineClient} from '@mandarax/api-client'
import {parseWidgetSettings, type WidgetSettings} from './widget-settings.js'
import {applyThemeOverrides} from './theme.js'
import {builtinToolCards, type ToolCardEntry} from '@mandarax/tool-ui'
import {collectToolRenderers, type AnyExtension} from '@mandarax/extension'

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
  const {root} = createShadowRoot()
  const apiBase = resolveApiBase()
  // One driver, shared by the page-bus and the test seam, so console-patching + registry happen once.
  const driver = makeDomPageDriver()
  window.__MANDARAX_PAGE_DRIVER__ = driver
  const settings = resolveWidget()
  for (const extension of extensions) if (extension.theme) applyThemeOverrides(root, extension.theme)
  const tools = (): ToolCardEntry[] => [...collectToolRenderers(extensions), ...builtinToolCards]
  // Chat + page-bus only exist on the mandarax dev server. Probe the non-session /models route: a 2xx
  // means chat is mounted (and carries the harness identity that gates the launch button). A throw
  // (404 / network) → a plain app, so the widget shows nothing.
  void defineClient({apiBase})
    .models()
    .then((models) => {
      const shell = createWidgetShell({settings})
      shell.registerPanel(chatPanelDef(apiBase, models.harness.id, tools, extensions))
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
