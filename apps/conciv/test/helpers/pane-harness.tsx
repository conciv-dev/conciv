import {createRoot, createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {makeRpcClient} from '@conciv/contract'
import {HostApiProvider} from '@conciv/extension'
import {AppContext, type AppContextValue} from '../../src/app/context.js'
import {EngineReachabilityContext, makeEngineReachability} from '../../src/app/reachability.js'
import {
  PaneContext,
  makeGrabStore,
  makePendingAttachmentQueue,
  type PaneContextValue,
} from '../../src/app/pane-context.js'
import {makeLiveSessions} from '../../src/app/live-sessions.js'
import {makeAppData} from '../../src/data/app-data.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {makeLayerStack} from '../../src/shell/dialogs.js'
import {NoticeContextProvider, NoticeSurface} from '../../src/shell/notice-context.js'
import {CORE_BASE} from './fake-core.js'

export const PANE_SESSION = 'conciv_1'

export type PaneMount = {
  dispose: () => void
  announced: () => string[]
  pane: PaneContextValue
  refetch: () => Promise<void>
}

function AnnounceLog(props: {entries: () => string[]}): JSX.Element {
  return (
    <div aria-live="polite" role="log" aria-label="Announcements">
      {props.entries().join(' | ')}
    </div>
  )
}

export function mountPane(view: (pane: PaneContextValue) => JSX.Element): PaneMount {
  const rpc = makeRpcClient(CORE_BASE)
  const queryClient = new QueryClient()
  const data = makeAppData(rpc, queryClient)
  const [announced, setAnnounced] = createSignal<string[]>([])
  const app: AppContextValue = {
    rpc,
    settings: parseConcivSettings(''),
    environment: {rootNode: document, document},
    data,
    liveSessions: makeLiveSessions(),
    queryClient,
    announce: (message) => setAnnounced((entries) => [...entries, message]),
    layers: makeLayerStack(),
    suppressed: () => undefined,
    fabPosition: () => 'bottom-right',
    instances: [],
    connected: () => true,
    arrivedFromConnect: () => false,
    connectBind: async () => '',
    connectMode: false,
    connectionGeneration: () => 0,
    apiBase: () => CORE_BASE,
  }
  const pane: PaneContextValue = {
    sessionId: () => PANE_SESSION,
    running: () => false,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabStore: makeGrabStore(),
    grabProvider: undefined,
    attachments: makePendingAttachmentQueue(),
    newSession: () => {},
  }
  const reachabilityRoot = createRoot((disposeReachability) => ({
    reachability: makeEngineReachability(),
    dispose: disposeReachability,
  }))
  const mounted = render(() => (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={app}>
        <EngineReachabilityContext.Provider value={reachabilityRoot.reachability}>
          <NoticeContextProvider>
            <PaneContext.Provider value={pane}>
              <HostApiProvider rpc={rpc} apiBase={() => ''} toast={(message) => app.announce(message)}>
                <div class="flex flex-col h-150 w-100">
                  {view(pane)}
                  <NoticeSurface />
                </div>
                <AnnounceLog entries={announced} />
              </HostApiProvider>
            </PaneContext.Provider>
          </NoticeContextProvider>
        </EngineReachabilityContext.Provider>
      </AppContext.Provider>
    </QueryClientProvider>
  ))
  return {
    dispose: () => {
      mounted.unmount()
      reachabilityRoot.dispose()
    },
    announced,
    pane,
    refetch: () => queryClient.invalidateQueries({queryKey: data.utils.meta.engine.key()}),
  }
}
