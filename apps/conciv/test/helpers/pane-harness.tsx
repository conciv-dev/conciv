import {createRoot, createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {QueryClientProvider, type QueryClient} from '@tanstack/solid-query'
import {browserRpcConnection, closeBrowserRpcConnection} from '@conciv/contract'
import '../../src/lib/api-base.js'
import {HostApiProvider} from '@conciv/extension/host'
import {AppContext} from '../../src/app/context.js'
import {makeAppContextValue} from './app-context-value.js'
import {EngineReachabilityContext, makeEngineReachability} from '../../src/app/reachability.js'
import {
  PaneContext,
  makeGrabStore,
  makePendingAttachmentQueue,
  type PaneContextValue,
} from '../../src/app/pane-context.js'
import {type AppData} from '../../src/data/app-data.js'
import {NoticeContextProvider, NoticeSurface} from '../../src/shell/notice-context.js'

export type PaneMountOptions = {base: string; sessionId: string}

export type PaneMount = {
  dispose: () => void
  announced: () => string[]
  pane: PaneContextValue
  data: AppData
  queryClient: QueryClient
  refetch: () => Promise<void>
}

function AnnounceLog(props: {entries: () => string[]}): JSX.Element {
  return (
    <div aria-live="polite" role="log" aria-label="Announcements">
      {props.entries().join(' | ')}
    </div>
  )
}

export function mountPane(options: PaneMountOptions, view: (pane: PaneContextValue) => JSX.Element): PaneMount {
  window.__CONCIV_API_BASE__ = options.base
  browserRpcConnection(options.base, 'fetch')
  const [announced, setAnnounced] = createSignal<string[]>([])
  const app = makeAppContextValue({
    base: options.base,
    announce: (message) => setAnnounced((entries) => [...entries, message]),
  })
  const {rpc, data, queryClient} = app
  const pane: PaneContextValue = {
    sessionId: () => options.sessionId,
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
      closeBrowserRpcConnection(options.base)
      delete window.__CONCIV_API_BASE__
    },
    announced,
    pane,
    data,
    queryClient,
    refetch: () => queryClient.invalidateQueries({queryKey: data.utils.meta.engine.key()}),
  }
}
