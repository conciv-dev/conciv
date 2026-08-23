import {
  Outlet,
  createRootRouteWithContext,
  retainSearchParams,
  useMatchRoute,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/solid-router'
import {QueryClientProvider} from '@tanstack/solid-query'
import {Dialog, EnvironmentProvider, Popover} from '@conciv/ui-kit-system'
import {terminalTheme} from '@conciv/ui-kit-chat/theme/themes/terminal'
import {HostApiProvider} from '@conciv/extension/host'
import {showToast} from '@conciv/page'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {Show, createEffect, createMemo, createSignal, onCleanup, onMount} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {
  CONNECTION_CHANGED_EVENT,
  createEventBus,
  createEventBusClient,
  PANEL_PLUGIN_ID,
  PANEL_TOGGLED_EVENT,
  type PanelCommandEventMap,
} from '@conciv/protocol/event-bus'
import type {ConcivRouterContext} from '../router.js'
import {
  AppContext,
  useColorScheme,
  useConnected,
  useLayers,
  useLiveSessions,
  useNotifyInteractive,
  useSettings,
  useSuppressed,
  useWarmSession,
  type AppContextValue,
} from '../app/context.js'
import {makeLiveSessions} from '../app/live-sessions.js'
import {createWarmSession} from '../app/warm-session.js'
import {EngineReachabilityContext, makeEngineReachability} from '../app/reachability.js'
import {makeLayerStack} from '../shell/dialogs.js'
import {ShellFab} from '../shell/fab.js'
import {EffectsSurface} from '../shell/effects-surface.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import {applyChatTheme, makeThemeApplier} from '../lib/theme.js'
import {toRawHotkey} from '../lib/hotkey.js'
import {escapeInTerminal} from '../shell/terminal-focus.js'
import {hostFocusTarget} from '../lib/host-focus.js'
import {quickPaneIds} from '../lib/quick-search.js'
import {setShutter} from '../lib/shutter.js'
import {PanelChromeContext} from '../app/panel-chrome.js'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../lib/media-query.js'
import {applySchemeClass, createHostColorScheme} from '../lib/color-scheme.js'
import '../styles.css'

const OPEN_DISMISSABLE_LAYER_SELECTOR = '[data-scope][data-part="content"][data-state="open"]'

export const Route = createRootRouteWithContext<ConcivRouterContext>()({
  validateSearch: (search: Record<string, unknown>): {open?: true} => (search.open === true ? {open: true} : {}),
  search: {middlewares: [retainSearchParams(['open'])]},
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

  const [arrivedFromConnect, setArrivedFromConnect] = createSignal(false)
  const connectBind = async (apiBase: string): Promise<string> => {
    app.bindApiBase?.(apiBase)
    const {sessionId} = await app.rpc.sessions.resolve({})
    setArrivedFromConnect(true)
    return sessionId
  }

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
  const warm = createWarmSession(app.data, app.connected, app.queryClient)
  const activeSession = createMemo<string | null>(
    (previous) => sessionFromRoute() ?? previous ?? warm.sessionId() ?? null,
    null,
  )
  app.bindActiveSession?.(() => activeSession())
  const themeRoot = (): ShadowRoot | Document => {
    const node = app.environment.rootNode
    if (node instanceof ShadowRoot) return node
    return node instanceof Document ? node : document
  }
  onMount(() => {
    const applyTheme = makeThemeApplier(themeRoot())
    for (const extension of app.extensions) if (extension.theme) applyTheme(extension.theme)
  })

  const liveSessions = makeLiveSessions()
  const colorScheme = createHostColorScheme()

  const value: AppContextValue = {
    rpc: app.rpc,
    settings: app.settings,
    environment: app.environment,
    data: app.data,
    liveSessions,
    warmSession: warm,
    queryClient: app.queryClient,
    announce,
    layers,
    suppressed,
    fabPosition: fab.position,
    instances: app.instances,
    connected: app.connected,
    arrivedFromConnect,
    connectBind,
    connectMode: app.connectMode,
    disconnect: app.disconnect,
    grabProvider: app.grabProvider,
    connectionGeneration: app.connectionGeneration,
    apiBase: app.apiBase,
    notifyInteractive: app.notifyInteractive,
    colorScheme,
  }

  createEffect(() => {
    const node = app.environment.rootNode
    if (!(node instanceof ShadowRoot)) return
    applySchemeClass(node.host, colorScheme())
  })

  createEffect(() => {
    const isConnected = app.connected()
    window.dispatchEvent(new CustomEvent(CONNECTION_CHANGED_EVENT, {detail: {connected: isConnected}}))
  })

  const reachability = makeEngineReachability()

  return (
    <EnvironmentProvider value={() => app.environment.rootNode}>
      <QueryClientProvider client={app.queryClient}>
        <AppContext.Provider value={value}>
          <EngineReachabilityContext.Provider value={reachability}>
            <HostApiProvider
              rpc={app.rpc}
              apiBase={app.apiBase}
              toast={showToast}
              openEditor={(file, line) =>
                void app.rpc.editor
                  .open({file, line})
                  .catch(() => showToast(`could not open ${file} in the editor`, 'error'))
              }
              registerLayer={(isOpen, hides) => layers.register(isOpen, hides)}
              dialog={layers.track(Dialog)}
              popover={Object.assign({}, Popover, {Root: layers.track(Popover.Root)})}
              sessionId={activeSession}
              colorScheme={colorScheme}
            >
              <RootChrome
                fab={fab}
                activeSession={activeSession}
                politeMessage={politeMessage}
                assertiveMessage={assertiveMessage}
              />
              <EffectsSurface instances={app.instances} />
            </HostApiProvider>
          </EngineReachabilityContext.Provider>
        </AppContext.Provider>
      </QueryClientProvider>
    </EnvironmentProvider>
  )
}

function RootChrome(props: {
  fab: ReturnType<typeof createDraggablePosition>
  activeSession: () => string | null
  politeMessage: () => string
  assertiveMessage: () => string
}) {
  const settings = useSettings()
  const colorScheme = useColorScheme()
  const layers = useLayers()
  const suppressed = useSuppressed()
  const connected = useConnected()
  const liveSessions = useLiveSessions()
  const notifyInteractive = useNotifyInteractive()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const panelMatch = matchRoute({to: '/panel/$sessionId', fuzzy: true})
  const connectMatch = matchRoute({to: '/panel/connect'})
  const quickMatch = matchRoute({to: '/quick'})
  const closedMatch = matchRoute({to: '/'})
  const rootSearch = Route.useSearch()
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const shutterOpen = () => rootSearch().open === true
  const panelOpen = () => (Boolean(panelMatch()) || Boolean(connectMatch())) && shutterOpen()
  const launcherVisible = () => settings.launcher === 'mascot' && settings.modal.enabled && !(phone() && panelOpen())

  const warm = useWarmSession()
  const activeRowRunning = () => warm.rows().find((session) => session.id === props.activeSession())?.running ?? false
  const working = () => {
    const activity = liveSessions.activityIn(props.activeSession())
    if (activity === 'unmounted') return activeRowRunning()
    return activity === 'running'
  }

  let rootEl: HTMLDivElement | undefined
  let fabEl: HTMLButtonElement | undefined
  let pendingFabFocus = false
  let hostRestoreTarget: HTMLElement | null = null

  const mascotRect = (): {x: number; y: number; width: number; height: number} | null => {
    if (settings.launcher !== 'mascot') return null
    const rect = fabEl?.getBoundingClientRect()
    return rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null
  }
  const reportPanelState = () => {
    const open = panelOpen()
    window.dispatchEvent(
      new CustomEvent(PANEL_TOGGLED_EVENT, {
        detail: {open, connected: connected(), mascotRect: open ? null : mascotRect()},
      }),
    )
  }
  const openPanel = () => {
    if (!panelOpen()) hostRestoreTarget = rootEl ? hostFocusTarget(rootEl) : null
    if (panelMatch() || connectMatch()) {
      void setShutter(router, true)
      return
    }
    const sessionId = warm.sessionId()
    if (sessionId) {
      void router.navigate({
        to: '/panel/$sessionId',
        params: {sessionId},
        search: {open: true},
        replace: Boolean(quickMatch()),
      })
      return
    }
    void router.navigate({to: '/panel/latest', search: {open: true}, replace: Boolean(quickMatch())})
  }
  const closePanel = () => {
    const captured = hostRestoreTarget
    hostRestoreTarget = null
    void setShutter(router, false).then(() => {
      if (captured?.isConnected) {
        captured.focus()
        return
      }
      if (fabEl?.isConnected) {
        fabEl.focus()
        return
      }
      pendingFabFocus = true
    })
  }
  const togglePanel = () => (panelOpen() ? closePanel() : void openPanel())

  createEffect(() => {
    panelOpen()
    connected()
    launcherVisible()
    props.fab.position()
    let lastKey = ''
    let stableFrames = 0
    let frame = 0
    const tick = () => {
      const rect = mascotRect()
      const key = panelOpen() ? 'open' : rect ? [rect.x, rect.y, rect.width, rect.height].join(':') : 'none'
      if (key === lastKey) {
        stableFrames += 1
      }
      if (key !== lastKey) {
        lastKey = key
        stableFrames = 0
        reportPanelState()
      }
      if (stableFrames < 6) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  const eventBus = createEventBus()
  const panelCommands = createEventBusClient<PanelCommandEventMap>({pluginId: PANEL_PLUGIN_ID})

  onMount(() => {
    if (settings.defaultOpen && closedMatch()) void openPanel()
    makeEventListener(window, 'resize', reportPanelState)
    const unsubscribes = [
      panelCommands.on('open', () => void openPanel()),
      panelCommands.on('close', () => {
        if (panelOpen()) closePanel()
      }),
      panelCommands.on('toggle', () => togglePanel()),
    ]
    eventBus.start()
    notifyInteractive()
    onCleanup(() => {
      for (const unsubscribe of unsubscribes) unsubscribe()
      eventBus.stop()
      panelCommands.dispose()
    })
  })

  let dismissableLayerOpenAtEscapeCapture = false
  makeEventListener(
    window,
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      dismissableLayerOpenAtEscapeCapture =
        layers.anyOpen() || Boolean(rootEl?.querySelector(OPEN_DISMISSABLE_LAYER_SELECTOR))
    },
    {capture: true},
  )

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const dismissableLayerWasOpen = dismissableLayerOpenAtEscapeCapture
    dismissableLayerOpenAtEscapeCapture = false
    if (dismissableLayerWasOpen) return
    if (escapeInTerminal(rootEl)) return
    if (panelMatch()) {
      if (!shutterOpen()) return
      event.preventDefault()
      closePanel()
      return
    }
    if (closedMatch()) return
    event.preventDefault()
    router.history.back()
  }

  const toggleQuick = () => {
    if (!connected()) return
    if (quickMatch()) router.history.back()
    else void router.navigate({to: '/quick', search: {panes: '', focus: 0}, replace: Boolean(panelMatch())})
  }
  if (settings.quickTerminal.enabled) {
    for (const binding of settings.quickTerminal.hotkeys) createHotkey(toRawHotkey(binding), toggleQuick)
  }

  return (
    <div
      class={colorScheme()}
      ref={(el) => {
        applyChatTheme(terminalTheme)
        rootEl = el
      }}
      onKeyDown={onKeyDown}
    >
      <PanelChromeContext.Provider value={{close: closePanel}}>
        <Outlet />
      </PanelChromeContext.Provider>
      <Show when={launcherVisible()}>
        <ShellFab
          ref={(el) => {
            fabEl = el
            if (!pendingFabFocus) return
            pendingFabFocus = false
            el.focus()
          }}
          open={panelOpen}
          working={working}
          suppressed={suppressed}
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
