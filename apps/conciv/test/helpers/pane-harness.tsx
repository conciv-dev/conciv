import {createSignal, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {QueryClient, QueryClientProvider} from '@tanstack/solid-query'
import {makeRpcClient} from '@conciv/contract'
import {HostApiProvider} from '@conciv/extension'
import {AppContext, type AppContextValue} from '../../src/app/context.js'
import {
  PaneContext,
  makeGrabStore,
  makePendingAttachmentQueue,
  type PaneContextValue,
} from '../../src/app/pane-context.js'
import {makeAppData} from '../../src/data/app-data.js'
import {parseConcivSettings} from '../../src/data/settings.js'
import {makeLayerStack} from '../../src/shell/dialogs.js'
import {CORE_BASE} from './fake-core.js'

export const PANE_SESSION = 'conciv_1'

export type PaneMount = {
  dispose: () => void
  announced: () => string[]
  pane: PaneContextValue
}

function AnnounceLog(props: {entries: () => string[]}): JSX.Element {
  return (
    <div aria-live="polite" role="log" aria-label="Announcements">
      {props.entries().join(' | ')}
    </div>
  )
}

export function mountPane(view: (pane: PaneContextValue) => JSX.Element): PaneMount {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const rpc = makeRpcClient(CORE_BASE)
  const queryClient = new QueryClient()
  const [announced, setAnnounced] = createSignal<string[]>([])
  const app: AppContextValue = {
    rpc,
    settings: parseConcivSettings(''),
    environment: {rootNode: document, document},
    data: makeAppData(rpc, queryClient),
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
  const dispose = render(
    () => (
      <QueryClientProvider client={queryClient}>
        <AppContext.Provider value={app}>
          <PaneContext.Provider value={pane}>
            <HostApiProvider rpc={rpc} apiBase={() => ''} toast={(message) => app.announce(message)}>
              <div class="flex flex-col h-150 w-100">{view(pane)}</div>
              <AnnounceLog entries={announced} />
            </HostApiProvider>
          </PaneContext.Provider>
        </AppContext.Provider>
      </QueryClientProvider>
    ),
    host,
  )
  return {
    dispose: () => {
      dispose()
      host.remove()
    },
    announced,
    pane,
  }
}
