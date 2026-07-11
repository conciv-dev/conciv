import {
  Outlet,
  createRootRouteWithContext,
  useMatchRoute,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/solid-router'
import {QueryClientProvider, useQuery} from '@tanstack/solid-query'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {Show, createSignal, onMount} from 'solid-js'
import type {ConcivRouterContext} from '../router.js'
import {AppContext, useApp, type AppContextValue} from '../app/context.js'
import {makeLayerStack} from '../shell/dialogs.js'
import {ShellFab} from '../shell/fab.js'
import {createEffectsSurface} from '../shell/effects-surface.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import {makeThemeApplier} from '../lib/theme.js'
import {resolveApiBase} from '../lib/api-base.js'
import {toRawHotkey} from '../lib/hotkey.js'
import {escapeInTerminal} from '../shell/terminal-focus.js'
import {quickPaneIds} from '../lib/quick-search.js'
import '../styles.css'

export const Route = createRootRouteWithContext<ConcivRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const app = Route.useRouteContext()()
  const panelParams = useParams({from: '/panel/$sessionId', shouldThrow: false})
  const pipParams = useParams({from: '/pip/$sessionId', shouldThrow: false})
  const quickSearch = useSearch({from: '/quick', shouldThrow: false})

  const [politeMessage, setPoliteMessage] = createSignal('')
  const [assertiveMessage, setAssertiveMessage] = createSignal('')
  const announce = (message: string, assertive = false) =>
    assertive ? setAssertiveMessage(message) : setPoliteMessage(message)

  const layers = makeLayerStack()
  const suppressed = (): '' | undefined => (layers.anyHiding() ? '' : undefined)
  const fab = createDraggablePosition({initial: app.settings.modal.position, storageKey: 'conciv-fab-position'})

  const sessionFromRoute = (): string | null => {
    const panel = panelParams()
    if (panel) return panel.sessionId
    const pip = pipParams()
    if (pip) return pip.sessionId
    const quick = quickSearch()
    if (!quick) return null
    const ids = quickPaneIds(quick)
    return ids[Math.min(quick.focus, ids.length - 1)] ?? null
  }
  let lastActiveSession: string | null = null
  const activeSession = (): string | null => {
    const current = sessionFromRoute()
    if (current) lastActiveSession = current
    return lastActiveSession
  }
  const themeRoot = (): ShadowRoot | Document => {
    const node = app.environment.rootNode
    if (node instanceof ShadowRoot) return node
    return node instanceof Document ? node : document
  }
  const effects = createEffectsSurface({extensions: app.extensions, apiBase: resolveApiBase(), layers, activeSession})
  onMount(() => {
    const applyTheme = makeThemeApplier(themeRoot())
    for (const extension of app.extensions) if (extension.theme) applyTheme(extension.theme)
  })

  const value: AppContextValue = {
    rpc: app.rpc,
    settings: app.settings,
    environment: app.environment,
    data: app.data,
    queryClient: app.queryClient,
    announce,
    layers,
    suppressed,
    fabPosition: fab.position,
    instances: effects.instances,
  }

  return (
    <EnvironmentProvider value={() => app.environment.rootNode}>
      <QueryClientProvider client={app.queryClient}>
        <AppContext.Provider value={value}>
          <RootChrome fab={fab} politeMessage={politeMessage} assertiveMessage={assertiveMessage} />
          <effects.View />
        </AppContext.Provider>
      </QueryClientProvider>
    </EnvironmentProvider>
  )
}

function RootChrome(props: {
  fab: ReturnType<typeof createDraggablePosition>
  politeMessage: () => string
  assertiveMessage: () => string
}) {
  const app = useApp()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const panelMatch = matchRoute({to: '/panel/$sessionId', fuzzy: true})
  const quickMatch = matchRoute({to: '/quick'})
  const closedMatch = matchRoute({to: '/'})
  const panelOpen = () => Boolean(panelMatch())

  const sessions = useQuery(() => app.data.utils.sessions.list.queryOptions())
  const working = () => (sessions.data ?? []).some((session) => session.running)

  let fabEl: HTMLButtonElement | undefined

  const latestSessionId = async (): Promise<string> => {
    const rows = await app.queryClient.ensureQueryData(app.data.utils.sessions.list.queryOptions())
    const latest = rows.toSorted((a, b) => b.updatedAt - a.updatedAt)[0]
    if (latest) return latest.id
    return (await app.rpc.sessions.resolve({})).sessionId
  }
  const openPanel = async () => {
    const sessionId = await latestSessionId()
    void router.navigate({to: '/panel/$sessionId', params: {sessionId}, replace: Boolean(quickMatch())})
  }
  const closePanel = () => {
    router.history.back()
    fabEl?.focus()
  }
  const togglePanel = () => (panelOpen() ? closePanel() : void openPanel())

  let rootEl: HTMLDivElement | undefined
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (app.layers.anyOpen()) return
    if (closedMatch()) return
    if (escapeInTerminal(rootEl)) return
    event.preventDefault()
    router.history.back()
  }

  const toggleQuick = () => {
    if (quickMatch()) router.history.back()
    else void router.navigate({to: '/quick', search: {panes: '', focus: 0}, replace: Boolean(panelMatch())})
  }
  if (app.settings.quickTerminal.enabled) {
    for (const binding of app.settings.quickTerminal.hotkeys) createHotkey(toRawHotkey(binding), toggleQuick)
  }

  return (
    <div
      class="chat-theme-conciv"
      ref={(el) => {
        rootEl = el
      }}
      onKeyDown={onKeyDown}
    >
      <Outlet />
      <Show when={app.settings.modal.enabled}>
        <ShellFab
          ref={(el) => {
            fabEl = el
          }}
          open={panelOpen}
          working={working}
          suppressed={app.suppressed}
          fab={props.fab}
          onToggle={togglePanel}
        />
      </Show>
      <div class="sr-only" role="status" aria-live="polite">
        {props.politeMessage()}
      </div>
      <div class="sr-only" role="alert" aria-live="assertive">
        {props.assertiveMessage()}
      </div>
    </div>
  )
}
