import {render} from 'solid-js/web'
import {createShadowRoot} from './shadow.js'
import {createWidgetShell} from './widget-shell.js'
import {chatPanelDef} from './chat-panel.js'
import {elementPickerAction} from './react-grab/picker-action.js'
import {TestCard} from './test-card.js'
import {initPageBus} from './page-bus.js'
import {probeChatAvailable} from './chat-api.js'
import {parseWidgetSettings, type WidgetSettings} from './widget-settings.js'

// Entry: create the open Shadow DOM, probe the dev server, and mount the Solid chat agent +
// page-bus when the aidx routes are live. Auto-mounts on load; also exports mountWidget.

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

declare global {
  interface Window {
    __AIDX_RENDER_TEST_CARD__?: () => void
    __AIDX_API_BASE__?: string
  }
}

// apiBase from a window global (Next has no HTML-injection seam) or the meta tag (Vite path).
function resolveApiBase(): string {
  return window.__AIDX_API_BASE__ ?? metaContent('pw-api-base')
}

// Layout settings injected as the pw-widget meta JSON. Both layouts default on.
function resolveWidget(): WidgetSettings {
  return parseWidgetSettings(metaContent('pw-widget'))
}

// Test-only seam (browser IT): render a standalone live TestCard into the widget's shadow root.
function mountTestCardForTest(root: ShadowRoot, apiBase: string): void {
  const container = document.createElement('div')
  root.appendChild(container)
  render(() => <TestCard apiBase={apiBase} onFix={() => {}} result={null} />, container)
}

export function mountWidget(): void {
  if (document.querySelector('[data-aidx-root]')) return
  const {root} = createShadowRoot()
  const apiBase = resolveApiBase()
  window.__AIDX_RENDER_TEST_CARD__ = () => mountTestCardForTest(root, apiBase)
  const settings = resolveWidget()
  // Chat + page-bus only exist on the aidx dev server; probe first so a plain app shows nothing.
  void probeChatAvailable(apiBase).then((available) => {
    if (!available) return
    // The shell owns the chrome + layout modes and hosts the chat as a registered panel.
    const shell = createWidgetShell({settings})
    shell.registerPanel(chatPanelDef(apiBase))
    shell.registerComposerAction(elementPickerAction)
    shell.mount(root)
    initPageBus({apiBase})
  })
}

mountWidget()
