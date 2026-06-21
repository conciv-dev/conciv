import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import {createShadowRoot} from './shadow.js'
import {createWidgetShell} from './widget-shell.js'
import {chatPanelDef} from './chat-panel.js'
import {elementPickerAction} from './react-grab/picker-action.js'
import {newSessionAction} from './new-session-action.js'
import {compactAction} from './compact-action.js'
import {makeOpenInTerminalAction} from './open-in-terminal-action.js'
import {modelSelectorControl} from './model-selector.js'
import {TestCard} from './test-card.js'
import {initPageBus} from './page-bus.js'
import {makeDomPageDriver, type PageDriver} from './page-driver.js'
import {createEffectsHost} from './effects-host.js'
import highlightExtension from './effects/highlight-extension.js'
import type {Refs} from './page-snapshot.js'
import {installReactBridge} from './react-bridge.js'
import * as reactBridge from './react-bridge.js'
import {defineClient, type SessionClient} from './session-client.js'
import {parseWidgetSettings, type WidgetSettings} from './widget-settings.js'
import {applyThemeOverrides} from './theme.js'
import {setExtWidget, setExtHeader, setExtFooter, setExtStatus} from './ui-store.js'
import {setEmptyStateOverride} from './empty-state.js'
import {installExtensionGlobal} from './extension-runtime.js'
import {createClientDb} from './db/client-db.js'
import {createClientSync} from './sync/client-sync.js'
import {createRunTool} from './run-tool.js'
import {builtinTools} from '@mandarax/tool-ui'
import whiteboard from '@mandarax/whiteboard'
import {
  collectClientContributions,
  type ClientApi,
  type MandaraxExtension,
  type ToolDefinition,
} from '@mandarax/extensions'

// Entry: create the open Shadow DOM, probe the dev server, and mount the Solid chat agent +
// page-bus when the mandarax routes are live. Auto-mounts on load; also exports mountWidget.

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

declare global {
  interface Window {
    __MANDARAX_RENDER_TEST_CARD__?: () => void
    __MANDARAX_API_BASE__?: string
    // Test seam (browser IT): the live page driver, for driving React verbs against real fibers
    // without a running dev server. Same driver the page-bus uses (one console buffer / registry).
    __MANDARAX_PAGE_DRIVER__?: PageDriver
    __MANDARAX_REACT_BRIDGE__?: typeof import('./react-bridge.js')
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

// Test-only seam (browser IT): render a standalone live TestCard into the widget's shadow root.
function mountTestCardForTest(root: ShadowRoot, apiBase: string): void {
  const container = document.createElement('div')
  root.appendChild(container)
  render(() => <TestCard apiBase={apiBase} onFix={() => {}} result={null} />, container)
}

export function mountWidget(): void {
  if (document.querySelector('[data-mandarax-root]')) return
  // Install the RDT hook before the host app's React initializes (so inspect/override work).
  installReactBridge()
  const {root} = createShadowRoot()
  const apiBase = resolveApiBase()
  const previewId = metaContent('pw-preview-id')
  window.__MANDARAX_RENDER_TEST_CARD__ = () => mountTestCardForTest(root, apiBase)
  // Identity + capabilities the effects host (built next) and clientApi share. runTool sends the
  // active session's header so server tools scope to the right room; activeClient is late-bound to
  // the shell once it exists (effects only run after chat mounts anyway).
  const db = createClientDb(apiBase)
  const sync = createClientSync(apiBase, '')
  let activeClient: () => SessionClient | null = () => null
  const sessionId = () => activeClient()?.sessionId() ?? null
  const sessionHeaders = () => activeClient()?.chatHeaders() ?? {}
  const runTool = createRunTool(apiBase, sessionHeaders)
  // Effects host first: it owns the refs + injects the page `effect` verb handler into the one driver
  // the page-bus and test seam share. The built-in highlight extension applies through the same use()
  // path as user extensions — synchronously here, so it works even without the chat server.
  const refs: Refs = {map: new Map(), n: 0}
  const effectsHost = createEffectsHost({apiBase, refs, runTool, db, sync, previewId, sessionId})
  const driver = makeDomPageDriver({refs, handlers: {effect: effectsHost.effectHandler}})
  window.__MANDARAX_PAGE_DRIVER__ = driver
  window.__MANDARAX_REACT_BRIDGE__ = reactBridge
  effectsHost.applyEffects(collectClientContributions([highlightExtension]).effects)
  const settings = resolveWidget()
  // Chat + page-bus only exist on the mandarax dev server. Probe the non-session /models route: a 2xx
  // means chat is mounted (and carries the harness identity that gates the launch button). A throw
  // (404 / network) → a plain app, so the widget shows nothing.
  void defineClient({apiBase})
    .models()
    .then((models) => {
      // Extension tools come first so an extension can override a built-in by name; upsert keeps HMR
      // re-applies from duplicating.
      const [extTools, setExtTools] = createSignal<ToolDefinition[]>([])
      const tools = () => [...extTools(), ...builtinTools]
      const addTool = (tool: ToolDefinition) =>
        setExtTools((prev) =>
          prev.some((e) => e.name === tool.name) ? prev.map((e) => (e.name === tool.name ? tool : e)) : [...prev, tool],
        )
      // The shell owns the chrome + layout modes and hosts the chat as a registered panel.
      const shell = createWidgetShell({settings})
      activeClient = shell.activeClient
      shell.registerPanel(chatPanelDef(apiBase, models.harness.id, tools))
      shell.registerComposerAction(elementPickerAction)
      shell.registerComposerAction(newSessionAction)
      shell.registerComposerAction(compactAction)
      if (models.harness.canLaunch) shell.registerComposerAction(makeOpenInTerminalAction(models.harness.name))
      shell.registerComposerControl(modelSelectorControl)
      shell.mount(root)
      // Adapt the public ExtComposerAction (slim, stable) to the shell's richer internal def: the
      // public onClick ctx exposes only insert + notify, mapped from the full capability bag.
      const clientApi: ClientApi = {
        ui: {
          setTheme: (tokens) => applyThemeOverrides(root, tokens),
          setWidget: setExtWidget,
          setHeader: setExtHeader,
          setFooter: setExtFooter,
          setStatus: setExtStatus,
          setEmptyState: setEmptyStateOverride,
        },
        registerComposerAction: (action) =>
          shell.registerComposerAction({
            id: action.id,
            label: action.label,
            icon: action.icon,
            onClick: (ctx) => action.onClick({insert: ctx.insert, notify: ctx.notify, runTool}),
          }),
        db,
        sync,
        runTool,
        previewId,
        sessionId,
      }
      whiteboard.clientFn?.(clientApi)
      const builtin = collectClientContributions([whiteboard])
      for (const t of builtin.tools) addTool(t)
      if (builtin.effects.length) effectsHost.applyEffects(builtin.effects)
      installExtensionGlobal((ext: MandaraxExtension) => {
        ext.clientFn?.(clientApi)
        const contributions = collectClientContributions([ext])
        for (const t of contributions.tools) addTool(t)
        if (contributions.effects.length) effectsHost.applyEffects(contributions.effects)
      })
      initPageBus({apiBase, driver})
    })
    .catch(() => {
      // No /models route (older core / non-chat server) → mount nothing.
    })
}

mountWidget()
