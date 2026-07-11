import {Outlet, createRootRouteWithContext, useMatchRoute, useRouter} from '@tanstack/solid-router'
import {QueryClientProvider, useQuery} from '@tanstack/solid-query'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {installClientApi} from '@conciv/extension'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {Show, createSignal, onCleanup, onMount} from 'solid-js'
import type {ConcivRouterContext} from '../router.js'
import {AppContext, type AppContextValue} from '../app/context.js'
import {makeLayerStack} from '../shell/dialogs.js'
import {ShellFab} from '../shell/fab.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import {makeThemeApplier} from '../lib/theme.js'
import {resolveApiBase} from '../lib/api-base.js'
import {toRawHotkey} from '../lib/hotkey.js'
import {escapeInTerminal} from '../shell/terminal-focus.js'
import {makeAppClientApi} from '../extension/client-api.js'
import type {ExtensionInstance} from '../extension/extension-slots.js'
import '../styles.css'

export const Route = createRootRouteWithContext<ConcivRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const app = Route.useRouteContext()()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const panelMatch = matchRoute({to: '/panel/$sessionId', fuzzy: true})
  const quickMatch = matchRoute({to: '/quick'})
  const closedMatch = matchRoute({to: '/'})
  const panelOpen = () => Boolean(panelMatch())

  const sessions = useQuery(() => app.data.utils.sessions.list.queryOptions())
  const working = () => (sessions.data ?? []).some((session) => session.running)

  const [politeMessage, setPoliteMessage] = createSignal('')
  const [assertiveMessage, setAssertiveMessage] = createSignal('')
  const announce = (message: string, assertive = false) =>
    assertive ? setAssertiveMessage(message) : setPoliteMessage(message)

  const layers = makeLayerStack()
  const suppressed = (): '' | undefined => (layers.anyHiding() ? '' : undefined)
  const fab = createDraggablePosition({initial: app.settings.modal.position, storageKey: 'conciv-fab-position'})

  const [instances, setInstances] = createSignal<ExtensionInstance[]>([])
  const activeSession = (): string | null => {
    const match = panelMatch()
    return match ? match.sessionId : null
  }
  const themeRoot = (): ShadowRoot | Document => {
    const node = app.environment.rootNode
    if (node instanceof ShadowRoot) return node
    return node instanceof Document ? node : document
  }
  onMount(() => {
    installClientApi(makeAppClientApi({apiBase: resolveApiBase(), layers, activeSession}))
    const applyTheme = makeThemeApplier(themeRoot())
    for (const extension of app.extensions) if (extension.theme) applyTheme(extension.theme)
    const created = app.extensions.map((extension) => {
      const result = extension.__client?.()
      return {extension, clientValue: result?.value ?? {}, dispose: result?.dispose}
    })
    setInstances(created)
    onCleanup(() => {
      for (const instance of created) instance.dispose?.()
    })
  })

  let fabEl: HTMLButtonElement | undefined

  const latestSessionId = async (): Promise<string> => {
    const rows = await app.queryClient.ensureQueryData(app.data.utils.sessions.list.queryOptions())
    const latest = rows.toSorted((a, b) => b.updatedAt - a.updatedAt)[0]
    if (latest) return latest.id
    return (await app.rpc.sessions.resolve({})).sessionId
  }
  const openPanel = async () => {
    const sessionId = await latestSessionId()
    void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
  }
  const closePanel = () => {
    router.history.back()
    fabEl?.focus()
  }
  const togglePanel = () => (panelOpen() ? closePanel() : void openPanel())

  let rootEl: HTMLDivElement | undefined
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (layers.anyOpen()) return
    if (closedMatch()) return
    if (escapeInTerminal(rootEl)) return
    event.preventDefault()
    router.history.back()
  }

  const toggleQuick = () => {
    if (quickMatch()) router.history.back()
    else void router.navigate({to: '/quick', search: {panes: '', focus: 0}})
  }
  if (app.settings.quickTerminal.enabled) {
    for (const binding of app.settings.quickTerminal.hotkeys) createHotkey(toRawHotkey(binding), toggleQuick)
  }

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
    instances,
  }

  return (
    <EnvironmentProvider value={() => app.environment.rootNode}>
      <QueryClientProvider client={app.queryClient}>
        <AppContext.Provider value={value}>
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
                suppressed={suppressed}
                fab={fab}
                onToggle={togglePanel}
              />
            </Show>
            <div class="sr-only" role="status" aria-live="polite">
              {politeMessage()}
            </div>
            <div class="sr-only" role="alert" aria-live="assertive">
              {assertiveMessage()}
            </div>
          </div>
        </AppContext.Provider>
      </QueryClientProvider>
    </EnvironmentProvider>
  )
}
