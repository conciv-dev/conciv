import {createRoot, createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {browserRpcConnection, closeBrowserRpcConnection, makeRpcClient} from '@conciv/contract'
import '../../src/lib/api-base.js'
import {HostApiProvider} from '@conciv/extension/host'
import {AppContext, type AppContextValue} from '../../src/app/context.js'
import {EngineReachabilityContext, makeEngineReachability} from '../../src/app/reachability.js'
import type {AnyExtension} from '@conciv/extension'
import type {Grab, GrabProvider} from '@conciv/grab'
import {
  PaneContext,
  makePendingAttachmentQueue,
  type PaneContextValue,
  type RefreshHandle,
} from '../../src/app/pane-context.js'
import {createInstances} from '../../src/extension/create-instances.js'
import {makeGrabStaging} from '../../src/pane/grab-staging.js'
import {makeAppData, type AppData} from '../../src/data/app-data.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {makeLayerStack} from '../../src/shell/dialogs.js'
import {NoticeContextProvider, NoticeSurface} from '../../src/shell/notice-context.js'

export type PaneMountOptions = {
  base: string
  sessionId: string
  grabProvider?: GrabProvider
  extensions?: AnyExtension[]
  ground?: (grab: Grab) => Promise<Grab | null>
  width?: number
  onNewSession?: () => void
}

export type PaneMount = {
  dispose: () => void
  announced: () => string[]
  pane: PaneContextValue
  data: AppData
  queryClient: QueryClient
  refetch: () => Promise<void>
  setWidth: (pixels: number) => void
}

const DEFAULT_PANE_WIDTH_PX = 400

function AnnounceLog(props: {entries: () => string[]}): JSX.Element {
  return (
    <div aria-live="polite" role="log" aria-label="Announcements">
      {props.entries().join(' | ')}
    </div>
  )
}

export function mountPane(options: PaneMountOptions, view: (pane: PaneContextValue) => JSX.Element): PaneMount {
  const rpc = makeRpcClient(options.base)
  window.__CONCIV_API_BASE__ = options.base
  browserRpcConnection(options.base, 'fetch')
  const queryClient = new QueryClient()
  const instances = createInstances(options.extensions ?? [])
  const data = makeAppData(rpc, queryClient)
  const [announced, setAnnounced] = createSignal<string[]>([])
  const [width, setWidth] = createSignal(options.width ?? DEFAULT_PANE_WIDTH_PX)
  const app: AppContextValue = {
    rpc,
    settings: parseConcivSettings(''),
    environment: {rootNode: document, document},
    data,
    queryClient,
    announce: (message) => setAnnounced((entries) => [...entries, message]),
    layers: makeLayerStack(),
    suppressed: () => undefined,
    fabPosition: () => 'bottom-right',
    instances,
    connected: () => true,
    arrivedFromConnect: () => false,
    connectBind: async () => '',
    connectMode: false,
    connectionGeneration: () => 0,
    apiBase: () => options.base,
    notifyInteractive: () => {},
  }
  const [refreshHandle, setRefreshHandle] = createSignal<RefreshHandle | null>(null)
  const pane: PaneContextValue = {
    sessionId: () => options.sessionId,
    running: () => false,
    viewLocked: () => false,
    setLockedFor: () => () => {},
    slideClass: () => '',
    resetSlide: () => {},
    grabStaging: makeGrabStaging({ground: options.ground ?? (async () => null)}),
    grabProvider: options.grabProvider,
    attachments: makePendingAttachmentQueue(),
    newSession: () => options.onNewSession?.(),
    refresh: refreshHandle,
    registerRefresh: (handle) => setRefreshHandle(handle),
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
                <div class="flex flex-col h-150" style={{width: `${width()}px`}}>
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
      for (const instance of instances) instance.dispose()
      reachabilityRoot.dispose()
      closeBrowserRpcConnection(options.base)
      delete window.__CONCIV_API_BASE__
    },
    announced,
    pane,
    data,
    queryClient,
    refetch: () => queryClient.invalidateQueries({queryKey: data.utils.meta.engine.key()}),
    setWidth,
  }
}
