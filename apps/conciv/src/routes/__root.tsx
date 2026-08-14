import {
  Outlet,
  createRootRouteWithContext,
  retainSearchParams,
  useMatchRoute,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/solid-router'
import {QueryClientProvider, useQuery} from '@tanstack/solid-query'
import {Dialog, EnvironmentProvider, Popover} from '@conciv/ui-kit-system'
import {HostApiProvider} from '@conciv/extension'
import {showToast} from '@conciv/page'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {Show, createEffect, createSignal, onCleanup, onMount} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {ConcivRouterContext} from '../router.js'
import {
  AppContext,
  useAppData,
  useConnected,
  useLayers,
  useLiveSessions,
  useSettings,
  useSuppressed,
  type AppContextValue,
} from '../app/context.js'
import {makeLiveSessions} from '../app/live-sessions.js'
import {EngineReachabilityContext, makeEngineReachability} from '../app/reachability.js'
import {makeLayerStack} from '../shell/dialogs.js'
import {ShellFab} from '../shell/fab.js'
import {EffectsSurface} from '../shell/effects-surface.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import {makeThemeApplier} from '../lib/theme.js'
import {toRawHotkey} from '../lib/hotkey.js'
import {escapeInTerminal} from '../shell/terminal-focus.js'
import {hostFocusTarget} from '../lib/host-focus.js'
import {quickPaneIds} from '../lib/quick-search.js'
import {setShutter} from '../lib/shutter.js'
import {PanelChromeContext} from '../app/panel-chrome.js'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../lib/media-query.js'
import '../styles.css'

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
  onMount(() => {
    const applyTheme = makeThemeApplier(themeRoot())
    for (const extension of app.extensions) if (extension.theme) applyTheme(extension.theme)
  })

  const liveSessions = makeLiveSessions()

  const value: AppContextValue = {
    rpc: app.rpc,
    settings: app.settings,
    environment: app.environment,
    data: app.data,
    liveSessions,
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
  }

  createEffect(() => {
    const isConnected = app.connected()
    window.dispatchEvent(new CustomEvent('conciv:connection-changed', {detail: {connected: isConnected}}))
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
              openEditor={(file, line) => void app.rpc.editor.open({file, line}).catch(() => {})}
              registerLayer={(isOpen, hides) => layers.register(isOpen, hides)}
              dialog={layers.track(Dialog)}
              popover={Object.assign({}, Popover, {Root: layers.track(Popover.Root)})}
              sessionId={activeSession}
            >
              <RootChrome fab={fab} politeMessage={politeMessage} assertiveMessage={assertiveMessage} />
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
  politeMessage: () => string
  assertiveMessage: () => string
}) {
  const data = useAppData()
  const settings = useSettings()
  const layers = useLayers()
  const suppressed = useSuppressed()
  const connected = useConnected()
  const liveSessions = useLiveSessions()
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

  const sessions = useQuery(() => ({...data.utils.sessions.list.queryOptions(), enabled: connected()}))
  const working = () =>
    liveSessions.anyRunning() || (sessions.isSuccess && sessions.data.some((session) => session.running))
  const latestSessionRow = () => {
    if (!sessions.isSuccess) return undefined
    if (sessions.data.length === 0) return undefined
    return sessions.data.toSorted((a, b) => b.updatedAt - a.updatedAt)[0]
  }
  const warmSession = useQuery(() => ({
    ...data.utils.sessions.resolve.queryOptions({input: {id: latestSessionRow()?.id}}),
    enabled: connected() && Boolean(latestSessionRow()),
  }))

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
      new CustomEvent('conciv:panel-toggled', {
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
    const sessionId = warmSession.data?.sessionId
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

  onMount(() => {
    if (settings.defaultOpen && closedMatch()) void openPanel()
    const openFromHost = () => void openPanel()
    const closeFromHost = () => {
      if (panelOpen()) closePanel()
    }
    const toggleFromHost = () => togglePanel()
    makeEventListener(window, 'resize', reportPanelState)
    makeEventListener(window, 'conciv:open-panel', openFromHost)
    makeEventListener(window, 'conciv:close-panel', closeFromHost)
    makeEventListener(window, 'conciv:toggle-panel', toggleFromHost)
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (layers.anyOpen()) return
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
      class="chat-theme-conciv"
      ref={(el) => {
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
