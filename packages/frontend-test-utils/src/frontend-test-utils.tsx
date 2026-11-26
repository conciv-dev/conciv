import {IconRegistryProvider} from '@conciv/ui-kit-chat'
import {BrowserTabId} from '@conciv/protocol/schema/browser-tab'
import {createMemo, For, mergeProps, onMount, Show, untrack, type JSX, type ParentProps} from 'solid-js'
import {createStore, produce} from 'solid-js/store'
import {render} from '@solidjs/testing-library'
import {Dynamic} from 'solid-js/web'
import {onTestFinished} from 'vitest'
import {
  makeBrowserEngineConnection,
  makeEngineRpcClient,
  type EngineConnection,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@conciv/client'
import {createFakeEngine, type FakeEngine} from '@internal/test-utils'
import {Conciv, type ConcivClient} from '@conciv/client'
import {AbsolutePath} from '@conciv/protocol/schema/schema'
import type {Entry} from '@conciv/frontend-plugin-api/host'
import {
  ToolRegistry,
  type ComposerNote,
  type Layout,
  type MountedSession,
  type Plugin,
  type PluginOptions,
  type ServerRef,
  type SessionScreen,
  type StorageScope,
  type ToastOptions,
  type ToolProps,
} from '@conciv/frontend-plugin-api'
import {NoteCard, OpaqueNoteCard, type ToolGroup} from '@internal/frontend-app-api'
import {PluginHostProvider, usePluginHost, type HostApiFactories} from '@internal/frontend-app-api/plugin/host'
import {DialogProvider} from '@internal/frontend-app-api/plugin/dialog-stack'
import {createRegion, RegionContent} from '@internal/frontend-app-api/plugin/panels'
import {PanelTrigger} from '@internal/frontend-app-api/plugin/panel-trigger'
import {Contribution, PluginStyles} from '@internal/frontend-app-api/plugin/render'
import {persistedHandle, storeName, type StoreLoads} from '@internal/frontend-app-api/plugin/stores'
import {ui} from '@internal/frontend-app-api/plugin/ui'
import {viewTabId, viewTabPanelId} from '@internal/frontend-app-api/lib/view-tab-ids'

export type TestPlugin = {
  readonly id: string
  readonly plugin: Plugin.Definition
  readonly options?: PluginOptions
  readonly builtin?: boolean
  readonly engineHalf?: boolean
  readonly toolGroup?: ToolGroup
}

export type RenderInTestAppOptions = {
  readonly engine?: FakeEngine | RealEngine
  readonly plugins: readonly TestPlugin[]
  readonly open?: readonly string[]
}

type AppElement = {readonly element?: () => JSX.Element}

export type TestApp = {
  readonly composer: {readonly text: () => string; readonly notes: () => readonly ComposerNote[]}
}

type AppState = {
  open: string[]
  active: string | undefined
  text: string
  notes: ComposerNote[]
  toasts: {id: number; options: ToastOptions}[]
}

const SESSION = 'ses_test'

function withOptions(setup: Plugin.Setup, options: PluginOptions | undefined): Plugin.Setup {
  if (options === undefined) return setup
  return (ctx) =>
    setup(new Proxy(ctx, {get: (target, key) => (key === 'options' ? options : Reflect.get(target, key))}))
}

export function testEntry(plugin: TestPlugin): Entry {
  const {setup, ...declarations} = plugin.plugin
  const options = plugin.builtin === true ? plugin.options : undefined
  return {...declarations, id: plugin.id, windowEntry: setup && (async () => ({default: withOptions(setup, options)}))}
}

function scopeKey(scope: StorageScope | undefined): string {
  if (scope === undefined || typeof scope === 'string') return scope ?? 'global'
  return 'session' in scope ? `session:${scope.session.id}` : `server:${scope.server}`
}

export function useFakeEngine(engine: FakeEngine = createFakeEngine()): FakeEngine {
  onTestFinished(() => {
    engine.dispose()
    const unanswered = engine.unanswered()
    if (unanswered.length > 0)
      throw new Error(`the fake engine was asked for what no test gave it: ${unanswered.join(', ')}`)
  })
  return engine
}

export type RealEngine = {
  readonly address: {readonly apiBase: string; readonly token: string}
  readonly root: string
}

export type BoundEngine = {
  readonly apiBase: string
  readonly directory: string
  readonly connection: EngineConnection
}

export function engineToken(engine: RealEngine): () => Promise<string> {
  return () => Promise.resolve(engine.address.token)
}

export function bindEngine(engine: FakeEngine | RealEngine): BoundEngine {
  if ('connection' in engine) return engine
  const connection = makeBrowserEngineConnection(engine.address.apiBase, {tokenSource: engineToken(engine)})
  onTestFinished(() => connection.dispose())
  return {apiBase: engine.address.apiBase, directory: engine.root, connection}
}

function engineClient(engine: BoundEngine): ConcivClient {
  return Conciv.make(
    makeEngineRpcClient(() => engine.connection),
    {server: () => engine.apiBase},
  )
}

function testServer(engine: BoundEngine, client: ConcivClient): ServerRef {
  return {
    id: 'engine',
    name: 'conciv',
    url: engine.apiBase,
    client,
    local: true,
    builtin: true,
    compatible: true,
    connected: true,
    data: {
      meta: {
        models: (sessionId) =>
          useQuery(() => ({
            queryKey: ['meta', 'models', sessionId()],
            queryFn: () => client.meta.models({sessionId: sessionId() ?? ''}),
            enabled: sessionId() !== undefined,
            retry: false,
          })),
      },
    },
  }
}

function createTestApp(engine: BoundEngine, client: ConcivClient, open: readonly string[]) {
  const [state, setState] = createStore<AppState>({
    open: [...open],
    active: open[0],
    text: '',
    notes: [],
    toasts: [],
  })
  const server = testServer(engine, client)
  const session: MountedSession = {
    key: `${server.id}\n${SESSION}`,
    id: SESSION,
    tab: SESSION,
    browserTab: {id: BrowserTabId.parse(`tab_${crypto.randomUUID()}`), connectionId: crypto.randomUUID()},
    server,
    pending: false,
    location: {directory: AbsolutePath.make(engine.directory)},
    visit: {},
    directory: engine.directory,
    local: undefined,
    run: {status: () => 'idle', interrupt: async () => ({interrupted: false})},
  }
  const screen: SessionScreen = {
    composer: {
      text: () => state.text,
      insert: (text) => setState('text', (current) => current + text),
      setText: (text) => setState('text', text),
      model: () => undefined,
      setModel: () => false,
      setVariant: () => false,
      attach(part) {
        if (part.type !== 'note') return
        if (state.notes.some((note) => note.origin === part.origin && note.commentId === part.commentId)) return
        setState('notes', (notes) => [...notes, part])
      },
      quotable: undefined,
      focus: () => undefined,
      update: (id, patch) =>
        setState(
          'notes',
          (note) => note.commentId === id,
          produce((note) => Object.assign(note, patch)),
        ),
      detach: (id) => setState('notes', (notes) => notes.filter((note) => note.commentId !== id)),
      focused: undefined,
    },
  }
  const panelState = (key: string) => {
    if (state.active === key) return 'visible'
    return state.open.includes(key) ? 'open' : 'closed'
  }
  const openTab: Layout['open'] = (key, _session, options) =>
    setState(
      produce((draft) => {
        if (!draft.open.includes(key)) draft.open.push(key)
        if (!options?.background) draft.active = key
      }),
    )
  const closeTab = (key: string) =>
    setState(
      produce((draft) => {
        draft.open = draft.open.filter((item) => item !== key)
        if (draft.active === key) draft.active = undefined
      }),
    )
  const hideTab = (key: string) => setState('active', (active) => (active === key ? undefined : active))
  const stores = new Map<string, unknown>()
  const storeLoads: StoreLoads = new WeakMap()
  const toastIds = {next: 0}

  const apis: HostApiFactories = {
    storage: (plugin) => ({
      store(key, options) {
        const name = `${storeName(plugin, key)}|${scopeKey(options.scope)}`
        const existing = stores.get(name)
        if (existing !== undefined) return existing as ReturnType<typeof persistedHandle<typeof options.initial>>
        const [store, set] = createStore(structuredClone(options.initial))
        const handle = persistedHandle({store, set, init: undefined}, storeLoads)
        stores.set(name, handle)
        return handle
      },
      memory(key, options) {
        const [store, set] = createStore(options.initial)
        return [store, (mutation) => set(produce(mutation))] as const
      },
      remove(key, options) {
        stores.delete(`${storeName(plugin, key)}|${scopeKey(options?.scope)}`)
      },
    }),
    system: () => ({
      copy: (text) => navigator.clipboard.writeText(text),
      save: async () => true,
      openExternal: () => undefined,
    }),
    desktop: () => undefined,
    app: () => ({name: 'conciv', version: '0.0.0', channel: 'dev', platform: 'web', packaged: false}),
    appearance: () => ({font: () => 'monospace', mode: () => 'light'}),
    overlay: (_plugin, _owner, _context, register) => () => {
      const element = document.createElement('div')
      document.body.append(element)
      return {element, dispose: register(() => element.remove())}
    },
    router: () => ({routing: () => false, path: () => '/'}),
    keybinds: () => ({keybind: () => [], keys: (bind) => (bind === 'none' ? [] : [bind]), matches: () => false}),
    servers: () => ({list: () => [server.id], get: (id) => (id === server.id ? server : undefined)}),
    sessions: () => ({list: () => [session], current: () => session}),
    tabs: () => ({
      list: () => [{key: session.tab, session, active: true}],
      open: () => undefined,
      focus: () => undefined,
      move: undefined,
      close: () => undefined,
    }),
    toast: (_plugin, _owner, _context, register) => ({
      show(options) {
        const id = toastIds.next++
        setState('toasts', (toasts) => [...toasts, {id, options}])
        const dismiss = () => setState('toasts', (toasts) => toasts.filter((toast) => toast.id !== id))
        return {dismiss: register(dismiss)}
      },
    }),
    attention: () => undefined,
    commands: () => undefined,
    screen: () => ({current: () => screen}),
    layout: (plugin) => ({
      narrow: undefined,
      ready: () => true,
      open: openTab,
      close: closeTab,
      toggle: (key, current) => (panelState(key) === 'visible' ? closeTab(key) : openTab(key, current)),
      hide: hideTab,
      state: panelState,
      stored: () => state.open.flatMap((key) => (key.startsWith(`${plugin}:`) ? [key.slice(plugin.length + 1)] : [])),
      scroll: undefined,
      settings: () => undefined,
      draft: () => undefined,
    }),
    ui: () => ui,
  }

  const tabs = () => ({
    all: () => state.open,
    active: () => state.active,
    setActive: (key: string | undefined) => setState('active', key),
    close: closeTab,
    remap: (rewrite: (key: string) => string) =>
      setState(
        produce((draft) => {
          draft.open = draft.open.map(rewrite)
          draft.active = draft.active === undefined ? undefined : rewrite(draft.active)
        }),
      ),
  })

  return {state, apis, storeLoads, session, screen, tabs}
}

type Created = ReturnType<typeof createTestApp>

function Panels(props: {app: Created}): JSX.Element {
  const app = untrack(() => props.app)
  const region = createRegion({region: 'pane', view: () => app.session, screen: app.screen, tabs: app.tabs})
  return (
    <>
      <div role="tablist" aria-label="Panels">
        <For each={region.keys()}>
          {(key) => (
            <Show when={region.entry(key)}>
              {(entry) => (
                <button
                  type="button"
                  role="tab"
                  id={viewTabId(key)}
                  aria-controls={viewTabPanelId(key)}
                  aria-selected={region.active() === key}
                  onClick={() => region.select(key)}
                >
                  <PanelTrigger
                    value={key}
                    plugin={entry().plugin}
                    tab={entry().tab}
                    session={props.app.session}
                    active={region.active() === key}
                    preview={false}
                  />
                </button>
              )}
            </Show>
          )}
        </For>
      </div>
      <RegionContent
        pane={region.pane}
        view={props.app.session}
        screen={props.app.screen}
        frame={{placement: () => 'pane', present: () => true, animate: () => false, shown: () => true}}
      />
      <ul aria-label="Notifications">
        <For each={props.app.state.toasts}>
          {(toast) => (
            <li role="status">
              {toast.options.title}
              <Show when={toast.options.description}>{(description) => <p>{description()}</p>}</Show>
            </li>
          )}
        </For>
      </ul>
    </>
  )
}

function Notes(props: {app: Created}): JSX.Element {
  const host = usePluginHost()
  const cards = () => host.items(OpaqueNoteCard.toInternal(NoteCard))
  return (
    <ul aria-label="Composer notes">
      <For each={props.app.state.notes}>
        {(note) => {
          const claimant = () => cards().findLast((item) => item.value.origins.includes(note.origin))
          return (
            <li>
              <Show when={claimant()} fallback={note.label}>
                {(found) => (
                  <Contribution plugin={found().plugin}>
                    {() => found().value.render({note, session: props.app.session})}
                  </Contribution>
                )}
              </Show>
            </li>
          )
        }}
      </For>
    </ul>
  )
}

function Resolve(props: {run: () => void}): null {
  onMount(() => props.run())
  return null
}

function Started(props: ParentProps<{ids: readonly string[]; started: () => void}>): JSX.Element {
  const host = usePluginHost()
  const settled = createMemo(() =>
    props.ids.every((id) => ['active', 'failed', 'disabled'].includes(host.status(id) ?? '')),
  )
  return (
    <>
      <Show when={settled()}>
        <Resolve run={props.started} />
      </Show>
      {props.children}
    </>
  )
}

async function trusted(engine: BoundEngine): Promise<void> {
  if (!(await engine.connection.trust.requestTrust())) throw new Error('the engine did not trust the test browser')
}

export function renderInTestApp(options: RenderInTestAppOptions): Promise<TestApp> {
  return renderPlugins(options)
}

async function renderPlugins(options: RenderInTestAppOptions & AppElement): Promise<TestApp> {
  const plugins = options.plugins
  const engine = bindEngine(options.engine ?? useFakeEngine())
  await trusted(engine)
  const client = engineClient(engine)
  const app = createTestApp(engine, client, options.open ?? [])
  const definitions = plugins.map(testEntry)
  const queryClient = new QueryClient()
  const started = Promise.withResolvers<void>()
  const plugin = (id: string) => {
    const found = plugins.find((item) => item.id === id)
    return found && {options: found.options ?? {}, client: () => client}
  }
  const container = document.createElement('div')
  container.setAttribute('data-conciv-root', '')
  document.body.append(container)
  onTestFinished(() => container.remove())
  render(
    () => (
      <QueryClientProvider client={queryClient}>
        <DialogProvider>
          <IconRegistryProvider>
            <PluginHostProvider
              definitions={() => definitions}
              disabled={() => new Set()}
              apis={app.apis}
              storeLoads={app.storeLoads}
              whenMounted={(run) => {
                run()
                return () => undefined
              }}
              plugin={plugin}
              unavailableClient={() => client}
              queryClient={queryClient}
            >
              <PluginStyles root={document} />
              <Started ids={definitions.map((definition) => definition.id)} started={started.resolve}>
                <Panels app={app} />
                <Notes app={app} />
                {options.element?.()}
              </Started>
            </PluginHostProvider>
          </IconRegistryProvider>
        </DialogProvider>
      </QueryClientProvider>
    ),
    {container},
  )
  await started.promise
  return {
    composer: {text: () => app.state.text, notes: () => app.state.notes},
  }
}

function ToolCard(props: ToolProps): JSX.Element {
  const host = usePluginHost()
  const name = untrack(() => props.tool)
  const shown = mergeProps({defaultOpen: untrack(() => props.error === undefined)}, props)
  const item = createMemo(() => host.items(ToolRegistry).findLast((found) => found.value.name === name))
  return (
    <Show when={item()} fallback={<p role="alert">No plugin draws the tool {props.tool}</p>}>
      {(found) => (
        <Contribution plugin={found().plugin}>
          {() => (
            <Dynamic
              component={props.error === undefined ? found().value.render : found().value.errorComponent}
              {...shown}
            />
          )}
        </Contribution>
      )}
    </Show>
  )
}

export type ExtensionTester = {
  renderToolCards(...cards: ToolProps[]): Promise<TestApp>
}

export function createExtensionTester(options: RenderInTestAppOptions): ExtensionTester {
  return {
    renderToolCards: (...cards) =>
      renderPlugins({
        ...options,
        element: () => (
          <ul aria-label="Tool cards">
            <For each={cards}>
              {(card) => (
                <li>
                  <ToolCard {...card} />
                </li>
              )}
            </For>
          </ul>
        ),
      }),
  }
}
