import {createMemo, createRoot, createSignal, type JSX} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {QueryClientProvider, type QueryClient} from '@tanstack/solid-query'
import {browserRpcConnection, closeBrowserRpcConnection} from '@conciv/contract'
import '../../src/lib/api-base.js'
import {HostApiProvider} from '@conciv/extension/host'
import {AppContext} from '../../src/app/context.js'
import {makeAppContextValue} from './app-context-value.js'
import {EngineReachabilityContext, makeEngineReachability} from '../../src/app/reachability.js'
import type {AnyExtension} from '@conciv/extension'
import type {Grab, GrabProvider} from '@conciv/grab'
import {useChatSession, type ChatTransportPreference} from '@conciv/client'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from '../../src/app/pane-context.js'
import {createInstances} from '../../src/extension/create-instances.js'
import {makeGrabStaging} from '../../src/pane/grab-staging.js'
import {makeRefreshCoordinator} from '../../src/pane/refresh-coordinator.js'
import {type AppData} from '../../src/data/app-data.js'
import {NoticeContextProvider, NoticeSurface} from '../../src/shell/notice-context.js'

export type PaneMountOptions = {
  base: string
  sessionId: string
  grabProvider?: GrabProvider
  extensions?: AnyExtension[]
  ground?: (grab: Grab) => Promise<Grab | null>
  width?: number
  transport?: ChatTransportPreference
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
  window.__CONCIV_API_BASE__ = options.base
  browserRpcConnection(options.base)
  const instances = createInstances(options.extensions ?? [])
  const [announced, setAnnounced] = createSignal<string[]>([])
  const [width, setWidth] = createSignal(options.width ?? DEFAULT_PANE_WIDTH_PX)
  const app = makeAppContextValue({
    base: options.base,
    sessionId: options.sessionId,
    announce: (message) => setAnnounced((entries) => [...entries, message]),
    instances,
  })
  const {rpc, data, queryClient} = app
  const chatRoot = createRoot((disposeChat) => {
    const chat = createMemo(() =>
      useChatSession({
        rpc,
        apiBase: options.base,
        sessionId: options.sessionId,
        ...(options.transport === undefined ? {} : {connection: {transport: options.transport}}),
      }),
    )
    const coordinator = makeRefreshCoordinator({
      chat,
      sessionId: () => options.sessionId,
      appData: data,
      queryClient,
      announce: app.announce,
    })
    return {chat, coordinator, dispose: disposeChat}
  })
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
    chat: chatRoot.chat,
    refresh: chatRoot.coordinator.refresh,
    isRefreshing: chatRoot.coordinator.isRefreshing,
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
      chatRoot.dispose()
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
