import {
  Outlet,
  createRootRouteWithContext,
  retainSearchParams,
  stripSearchParams,
  useMatchRoute,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/solid-router'
import {QueryClientProvider, useQuery} from '@conciv/client'
import {Dialog, EnvironmentProvider, Popover} from '@conciv/ui-kit-system'
import {HostApiProvider, getHostApi} from '@conciv/extension/host'
import {showToast} from '@conciv/page'
import {endRun, endTask, mountSimulator} from '@conciv/extension-page/client'
import {createHotkeys} from '@tanstack/solid-hotkeys'
import {Show, createEffect, createMemo, createReaction, createSignal, onCleanup, onMount} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {
  CONNECTION_CHANGED_EVENT,
  createEventBus,
  DOCK_REVEAL_EVENT,
  createEventBusClient,
  PANEL_PLUGIN_ID,
  PANEL_TOGGLED_EVENT,
  type PanelCommandEventMap,
} from '@conciv/protocol/event-bus'
import type {ConcivRouterContext} from '../router.js'
import {
  AppContext,
  useConnected,
  useEnvironment,
  useLayers,
  useLiveSessions,
  useHostTheme,
  useNotifyInteractive,
  usePreferences,
  useSettings,
  useSuppressed,
  useWarmSession,
  useAppData,
  useAppQueryClient,
  type AppContextValue,
} from '../app/context.js'
import {makeLiveSessions} from '../app/live-sessions.js'
import {createWarmSession} from '../app/warm-session.js'
import {EngineReachabilityContext, makeEngineReachability} from '../app/reachability.js'
import {makeLayerStack} from '../shell/dialogs.js'
import {ShellFab} from '../shell/fab.js'
import {EngineLoginDialog, engineConnected, engineLocked} from '../app/engine-login.js'
import {EffectsSurface} from '../shell/effects-surface.js'
import {NoticeContextProvider} from '../shell/notice-context.js'
import {createDraggablePosition, type PanelFrame} from '../lib/draggable-position.js'
import {createElementSize} from '@solid-primitives/resize-observer'
import {toRawHotkey} from '../lib/hotkey.js'
import {escapeInTerminal} from '../shell/terminal-focus.js'
import {hostFocusTarget} from '../lib/host-focus.js'
import {quickPaneIds} from '../lib/quick-search.js'
import {sessionPickerSearchSchema} from '../lib/session-search-schemas.js'
import {setShutter} from '../lib/shutter.js'
import {PanelChromeContext} from '../app/panel-chrome.js'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../lib/media-query.js'
import {applySchemeClass, applySkinClass, createHostTheme, themeClasses} from '../lib/color-scheme.js'
import {createPreferences} from '../settings/create-preferences.js'
import {DialogProvider} from '../runtime/plugin/dialog-stack.js'
import {PluginAttachment, PluginRoot} from '../runtime/plugin/root.js'
import {PluginOverlay, PluginPanelKeys} from '../shell/plugin-surfaces.js'
import '../styles.css'
import 'virtual:uno.css'

const OPEN_DISMISSABLE_LAYER_SELECTOR = '[data-scope]:not([data-scope="tabs"])[data-part="content"][data-state="open"]'

export const Route = createRootRouteWithContext<ConcivRouterContext>()({
  validateSearch: sessionPickerSearchSchema,
  search: {
    middlewares: [
      stripSearchParams({sessionSearch: '', allProjects: false}),
      retainSearchParams(['open', 'sessionSearch', 'allProjects']),
    ],
  },
  component: RootComponent,
})

function RootComponent() {
  const app = Route.useRouteContext()()
  return (
    <HostApiProvider rpc={app.rpc}>
      <AppRoot />
    </HostApiProvider>
  )
}

function AppRoot() {
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
  const liveSessions = makeLiveSessions({
    active: activeSession,
    rpc: app.rpc,
    apiBase: app.apiBase,
    generation: app.connectionGeneration,
    transport: () => app.settings.transport,
    appData: app.data,
    queryClient: app.queryClient,
    announce,
    onRunEnd: endRun,
  })
  const rootNode = app.environment.rootNode
  if (rootNode instanceof ShadowRoot) {
    onCleanup(
      mountSimulator({
        root: rootNode,
        session: activeSession,
        running: liveSessions.runLive,
        onStop: (sessionId) => {
          liveSessions.stop(sessionId)
          endTask()
        },
      }),
    )
  }
  const preferences = createPreferences({
    settings: getHostApi().useScope('conciv').settings,
    data: app.data,
    queryClient: app.queryClient,
    connected: app.connected,
    host: app.settings,
  })
  const theme = createHostTheme(rootNode instanceof ShadowRoot ? rootNode.host : undefined, preferences.stored)
  const colorScheme = () => theme().scheme

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
    fabAnchor: fab.anchor,
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
    theme,
    preferences,
  }

  createEffect(() => {
    const node = app.environment.rootNode
    if (!(node instanceof ShadowRoot)) return
    applySchemeClass(node.host, theme().scheme)
    applySkinClass(node.host, theme().skin)
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
            <NoticeContextProvider>
              <DialogProvider>
                <PluginRoot>
                  <PluginAttachment>
                    <PluginPanelKeys />
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
                      <Show when={app.login === undefined || engineConnected(app.login.status())}>
                        <EffectsSurface instances={app.instances} />
                      </Show>
                      <PluginOverlay />
                    </HostApiProvider>
                  </PluginAttachment>
                </PluginRoot>
              </DialogProvider>
            </NoticeContextProvider>
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
  const login = Route.useRouteContext()().login
  const settings = useSettings()
  const theme = useHostTheme()
  const layers = useLayers()
  const environment = useEnvironment()
  const suppressed = useSuppressed()
  const connected = useConnected()
  const liveSessions = useLiveSessions()
  const notifyInteractive = useNotifyInteractive()
  const preferences = usePreferences()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const panelMatch = matchRoute({to: '/panel/$sessionId', fuzzy: true})
  const settingsMatch = matchRoute({to: '/panel/$sessionId/settings', fuzzy: true})
  const connectMatch = matchRoute({to: '/panel/connect'})
  const quickMatch = matchRoute({to: '/quick'})
  const closedMatch = matchRoute({to: '/'})
  const rootSearch = Route.useSearch()
  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const shutterOpen = () => rootSearch().open === true
  const locked = () => login !== undefined && engineLocked(login.status())
  const awaitingLogin = () => login !== undefined && !engineConnected(login.status())
  const panelOpen = () => (Boolean(panelMatch()) || Boolean(connectMatch())) && shutterOpen()
  const loginOpen = () => locked() && shutterOpen() && Boolean(closedMatch())
  const launcherVisible = () =>
    preferences.launcher() === 'mascot' && settings.modal.enabled && !(phone() && panelOpen())
  const [panelElement, setPanelElement] = createSignal<HTMLElement>()
  const panelSize = createElementSize(panelElement)
  const digitObstacle = createMemo((): PanelFrame | undefined => {
    if (!panelOpen() || phone() || settings.surface === 'dock') return undefined
    const width = panelSize.width
    const height = panelSize.height
    if (width === null || height === null || width === 0 || height === 0) return undefined
    return props.fab.panelFrame({width, height})
  })

  const warm = useWarmSession()
  const activeRowRunning = createStoredRunning(() => props.activeSession(), connected)
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
    if (preferences.launcher() !== 'mascot') return null
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
  const showPanel = () => {
    if (!panelOpen()) hostRestoreTarget = rootEl ? hostFocusTarget(rootEl) : null
    if (awaitingLogin()) {
      void router.navigate({to: '/', search: {open: true}, replace: Boolean(quickMatch())})
      return
    }
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
  const closePanel = (restoreFocus = true) => {
    if (settings.surface === 'dock') return
    const captured = hostRestoreTarget
    hostRestoreTarget = null
    void setShutter(router, false).then(() => {
      if (!restoreFocus) return
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
  const togglePanel = () => (panelOpen() ? closePanel() : showPanel())
  const openStoredOnLoad = createReaction(() => {
    if (!settings.fromHost.defaultOpen && preferences.openOnLoad() && closedMatch()) showPanel()
  })
  openStoredOnLoad(() => preferences.status() === 'success')
  makeEventListener(document, 'pointerdown', (event: PointerEvent) => {
    if (!preferences.stored().closeOnOutsideClick || !panelOpen() || settings.surface === 'dock') return
    const root = rootEl?.getRootNode()
    const widget = root instanceof ShadowRoot ? root.host : rootEl
    if (widget && !event.composedPath().includes(widget)) closePanel(false)
  })
  const revealDock = (): boolean =>
    settings.surface === 'dock' && !window.dispatchEvent(new CustomEvent(DOCK_REVEAL_EVENT, {cancelable: true}))

  createEffect(() => {
    panelOpen()
    connected()
    launcherVisible()
    props.fab.anchor()
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
    const opensOnLoad = () =>
      (settings.surface === 'dock' && panelMatch() && !shutterOpen()) || (settings.defaultOpen && closedMatch())
    if (opensOnLoad()) showPanel()
    makeEventListener(window, 'resize', reportPanelState)
    const unsubscribes = [
      panelCommands.on('open', () => {
        revealDock()
        showPanel()
      }),
      panelCommands.on('close', () => {
        if (panelOpen()) closePanel()
      }),
      panelCommands.on('toggle', () => {
        if (!revealDock()) return togglePanel()
        showPanel()
      }),
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
        layers.anyOpen() || Boolean(environment.rootNode.querySelector(OPEN_DISMISSABLE_LAYER_SELECTOR))
    },
    {capture: true},
  )

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const dismissableLayerWasOpen = dismissableLayerOpenAtEscapeCapture
    dismissableLayerOpenAtEscapeCapture = false
    if (dismissableLayerWasOpen) return
    if (escapeInTerminal(rootEl)) return
    const settingsRoute = settingsMatch()
    if (settingsRoute) {
      event.preventDefault()
      void router.navigate({
        to: '/panel/$sessionId',
        params: {sessionId: settingsRoute.sessionId},
        replace: true,
        state: {restoreFocus: 'settings'},
      })
      return
    }
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

  const switchQuick = () => {
    if (!connected()) return
    const revealed = revealDock()
    if (quickMatch()) {
      if (!revealed) router.history.back()
      return
    }
    void router.navigate({
      to: '/quick',
      search: {panes: '', focus: 0},
      replace: settings.surface !== 'dock' && Boolean(panelMatch()),
    })
  }
  const toggleQuick = () => (awaitingLogin() ? showPanel() : switchQuick())
  createHotkeys(() => [
    ...preferences.shortcut('togglePanel').map((binding) => ({hotkey: toRawHotkey(binding), callback: togglePanel})),
    ...(settings.quickTerminal.enabled
      ? preferences.shortcut('quickTerminal').map((binding) => ({hotkey: toRawHotkey(binding), callback: toggleQuick}))
      : []),
  ])

  return (
    <div class={themeClasses(theme())} ref={(el) => (rootEl = el)} onKeyDown={onKeyDown}>
      <PanelChromeContext.Provider value={{close: () => closePanel(), frame: setPanelElement}}>
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
          avoid={digitObstacle}
          suppressed={suppressed}
          fab={props.fab}
          locked={() => locked() && !panelOpen()}
          waiting={() => liveSessions.waitingIn(props.activeSession()) && !panelOpen()}
          onToggle={togglePanel}
        />
      </Show>
      <Show when={loginOpen() ? login : undefined}>
        {(current) => <EngineLoginDialog trust={current().trust()} onClose={() => void setShutter(router, false)} />}
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

function createStoredRunning(activeSession: () => string | null, connected: () => boolean): () => boolean {
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const activeRow = useQuery(
    () => {
      const sessionId = activeSession()
      return {
        ...appData.utils.sessions.get.queryOptions({input: {sessionId: sessionId ?? ''}}),
        enabled: sessionId !== null && connected(),
      }
    },
    () => queryClient,
  )
  return () => (activeRow.isSuccess ? activeRow.data.running : false)
}
