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
import {Show, createSignal, onMount} from 'solid-js'
import type {ConcivRouterContext} from '../router.js'
import {
  AppContext,
  useAppData,
  useAppQueryClient,
  useLayers,
  useRpc,
  useSettings,
  useSuppressed,
  type AppContextValue,
} from '../app/context.js'
import {makeLayerStack} from '../shell/dialogs.js'
import {ShellFab} from '../shell/fab.js'
import {EffectsSurface} from '../shell/effects-surface.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import {makeThemeApplier} from '../lib/theme.js'
import {resolveApiBase} from '../lib/api-base.js'
import {toRawHotkey} from '../lib/hotkey.js'
import {escapeInTerminal} from '../shell/terminal-focus.js'
import {quickPaneIds} from '../lib/quick-search.js'
import {setShutter} from '../lib/shutter.js'
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
    instances: app.instances,
  }

  return (
    <EnvironmentProvider value={() => app.environment.rootNode}>
      <QueryClientProvider client={app.queryClient}>
        <AppContext.Provider value={value}>
          <HostApiProvider
            rpc={app.rpc}
            apiBase={resolveApiBase()}
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
  const rpc = useRpc()
  const data = useAppData()
  const queryClient = useAppQueryClient()
  const settings = useSettings()
  const layers = useLayers()
  const suppressed = useSuppressed()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const panelMatch = matchRoute({to: '/panel/$sessionId', fuzzy: true})
  const quickMatch = matchRoute({to: '/quick'})
  const closedMatch = matchRoute({to: '/'})
  const rootSearch = Route.useSearch()
  const shutterOpen = () => rootSearch().open === true
  const panelOpen = () => Boolean(panelMatch()) && shutterOpen()

  const sessions = useQuery(() => data.utils.sessions.list.queryOptions())
  const working = () => (sessions.data ?? []).some((session) => session.running)

  let fabEl: HTMLButtonElement | undefined

  const latestSessionId = async (): Promise<string> => {
    const rows = await queryClient.ensureQueryData(data.utils.sessions.list.queryOptions())
    const latest = rows.toSorted((a, b) => b.updatedAt - a.updatedAt)[0]
    return (await rpc.sessions.resolve(latest ? {id: latest.id} : {})).sessionId
  }
  const openPanel = async () => {
    if (panelMatch()) return setShutter(router, true)
    const sessionId = await latestSessionId()
    void router.navigate({
      to: '/panel/$sessionId',
      params: {sessionId},
      search: {open: true},
      replace: Boolean(quickMatch()),
    })
  }
  const closePanel = () => {
    setShutter(router, false)
    fabEl?.focus()
  }
  const togglePanel = () => (panelOpen() ? closePanel() : void openPanel())

  let rootEl: HTMLDivElement | undefined
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
      <Outlet />
      <Show when={settings.modal.enabled}>
        <ShellFab
          ref={(el) => {
            fabEl = el
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
