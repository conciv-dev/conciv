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
import {installReactBridge} from './react-bridge.js'
import {defineClient} from './session-client.js'
import {parseWidgetSettings, type WidgetSettings} from './widget-settings.js'
import {applyThemeOverrides} from './theme.js'
import {setExtWidget, setExtHeader, setExtFooter, setExtStatus} from './ui-store.js'
import {setEmptyStateOverride} from './empty-state.js'
import {installExtensionGlobal} from './extension-runtime.js'
import {makeCanvasToggle} from './canvas-toggle.js'
import {builtinToolCards, type ToolCardEntry} from '@mandarax/tool-ui'
import {collectClientContributions, type ClientApi, type MandaraxExtension} from '@mandarax/extensions'

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
  window.__MANDARAX_RENDER_TEST_CARD__ = () => mountTestCardForTest(root, apiBase)
  // One driver, shared by the page-bus and the test seam, so console-patching + registry happen once.
  const driver = makeDomPageDriver()
  window.__MANDARAX_PAGE_DRIVER__ = driver
  const settings = resolveWidget()
  // Chat + page-bus only exist on the mandarax dev server. Probe the non-session /models route: a 2xx
  // means chat is mounted (and carries the harness identity that gates the launch button). A throw
  // (404 / network) → a plain app, so the widget shows nothing.
  void defineClient({apiBase})
    .models()
    .then((models) => {
      // Extension tool cards (each tool self-describes via defineTool(...).render()). Composed with
      // the built-ins and passed to the panel like composerActions; extension entries come first so an
      // extension can override a built-in tool by name. Upsert keeps HMR re-applies from duplicating.
      const [extToolCards, setExtToolCards] = createSignal<ToolCardEntry[]>([])
      const tools = () => [...extToolCards(), ...builtinToolCards]
      const addToolCard = (entry: ToolCardEntry) =>
        setExtToolCards((prev) =>
          prev.some((e) => e.names[0] === entry.names[0])
            ? prev.map((e) => (e.names[0] === entry.names[0] ? entry : e))
            : [...prev, entry],
        )
      // The shell owns the chrome + layout modes and hosts the chat as a registered panel.
      const shell = createWidgetShell({settings})
      shell.registerPanel(chatPanelDef(apiBase, models.harness.id, tools))
      shell.registerComposerAction(elementPickerAction)
      shell.registerComposerAction(newSessionAction)
      shell.registerComposerAction(compactAction)
      // Lazy canvas overlay: injects the core-served bundle on first toggle, mounts into the shadow root.
      const canvasToggle = makeCanvasToggle(apiBase, 'local')
      shell.registerComposerAction({
        id: canvasToggle.id,
        label: canvasToggle.label,
        icon: canvasToggle.icon,
        onClick: () => void canvasToggle.onClick(),
      })
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
            onClick: (ctx) =>
              action.onClick({
                insert: ctx.insert,
                notify: ctx.notify,
                // Run a tool through core's shared loopback-gated execute (same path the agent uses).
                runTool: async (name, input) => {
                  const res = await fetch(`${apiBase}/api/tools/run`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {'content-type': 'application/json'},
                    body: JSON.stringify({name, input}),
                  })
                  return (await res.json()).result
                },
              }),
          }),
      }
      installExtensionGlobal((ext: MandaraxExtension) => {
        ext.clientFn?.(clientApi)
        for (const t of collectClientContributions([ext]).toolRenderers)
          addToolCard({names: [t.name], render: t.render})
      })
      initPageBus({apiBase, driver})
    })
    .catch(() => {
      // No /models route (older core / non-chat server) → mount nothing.
    })
}

mountWidget()
