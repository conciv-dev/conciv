import {Outlet, createRootRouteWithContext, useMatchRoute, useRouter} from '@tanstack/solid-router'
import {QueryClientProvider, useQuery} from '@tanstack/solid-query'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {Show, createSignal} from 'solid-js'
import type {ConcivRouterContext} from '../router.js'
import {AppContext, type AppContextValue} from '../app/context.js'
import {makeLayerStack} from '../shell/dialogs.js'
import {ShellFab} from '../shell/fab.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import '../styles.css'

export const Route = createRootRouteWithContext<ConcivRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const app = Route.useRouteContext()()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const panelMatch = matchRoute({to: '/panel/$sessionId', fuzzy: true})
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

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (layers.anyOpen()) return
    if (closedMatch()) return
    event.preventDefault()
    router.history.back()
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
  }

  return (
    <EnvironmentProvider value={() => app.environment.rootNode}>
      <QueryClientProvider client={app.queryClient}>
        <AppContext.Provider value={value}>
          <div class="chat-theme-conciv" onKeyDown={onKeyDown}>
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
