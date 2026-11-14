import {batch, createMemo, createSignal, getOwner, on, onCleanup, runWithOwner, untrack, type Accessor} from 'solid-js'
import {createStore, produce, type Store} from 'solid-js/store'
import type {StandardSchemaV1} from '@standard-schema/spec'
import {createORPCClient} from '@orpc/client'
import {useLocation, useParams, useRouter, useRouterState, useSearch} from '@tanstack/solid-router'
import {formatForDisplay} from '@tanstack/solid-hotkeys'
import {useQuery} from '@conciv/client'
import type {RpcClient} from '@conciv/contract'
import {writeClipboardText} from '@conciv/ui-kit-system'
import {Conciv, type ConcivClient} from '@conciv/plugin'
import type {
  Layout,
  MountedSession,
  PanelState,
  ServerRef,
  SessionRef,
  SessionScreen,
  ShellTab,
  Storage,
  StorageScope,
  StoreFrom,
  StoreOptions,
  Tabs,
  ToastOptions,
} from '@conciv/plugin/experimental'
import appManifest from '../../../package.json' with {type: 'json'}
import {
  useApiBase,
  useAppData,
  useAppQueryClient,
  useConnected,
  useHostTheme,
  useInstances,
  useRpc,
} from '../../app/context'
import {collectViews} from '../../extension/extension-views'
import {createMediaQuery, PHONE_MEDIA_QUERY} from '../../lib/media-query'
import {quickPaneIds, quickSearchFor} from '../../lib/quick-search'
import type {ComposerInputHandle} from '../../pane/composer-input-adapter'
import {appendDraft} from '../../pane/draft-storage'
import {engineOlderThanWidget, engineVersionQueryOptions} from '../../shell/engine-notice'
import {useNotices} from '../../shell/notice-context'
import type {NoticeTone} from '../../shell/notices'
import {Persist, persisted, removePersisted} from '../persistence/storage'
import {
  createHostApiAttachState,
  selectAttachAttempt,
  selectAttached,
  selectDraining,
  transitionHostApiAttach,
  type HostApiAttachEvent,
} from './attach-machine'
import {usePluginHost, type HostApiFactories} from './host'
import {icons} from './icons'
import {createLocatedWrites} from './located'
import {createMobileViews} from './mobile'
import {isPluginView} from './panel-keys'
import type {Region} from './panels'
import {deferredHandle, globalStoreTarget, persistedHandle, storeImports, storeName} from './stores'
import {ui} from './ui'

type Attached = {
  sessions: Accessor<readonly SessionRef[]>
  current: Accessor<MountedSession | undefined>
  tabs: Omit<Tabs, 'move'>
  screen: Accessor<SessionScreen | undefined>
  layout: Pick<Layout, 'open' | 'close' | 'toggle' | 'hide' | 'state'> & {
    stored(plugin: string, session: SessionRef): readonly string[]
  }
  settings: (page?: string) => void
  draft: (plugin: string, input: Parameters<Layout['draft']>[0]) => void
  mode: Accessor<'light' | 'dark'>
  routing: Accessor<boolean>
  path: Accessor<string>
  servers: Accessor<readonly string[]>
  server: (id: string) => ServerRef | undefined
}

export type ComposerBinding = {
  readonly composer: {readonly text: Accessor<string>; readonly setText: (value: string) => void}
  readonly input: Accessor<ComposerInputHandle | undefined>
  readonly prompt: {readonly quotable: Accessor<boolean>; readonly focus: () => void; readonly focused: () => boolean}
}

type ComposerBinder = {
  readonly sessionId: Accessor<string>
  readonly bind: (binding: ComposerBinding) => () => void
  readonly bindDraft: (ready: Promise<unknown>) => void
}

const TOAST_TONE: Record<NonNullable<ToastOptions['variant']>, NoticeTone> = {
  default: 'info',
  success: 'success',
  error: 'danger',
  loading: 'info',
}

const UNAVAILABLE = 'The server that runs this plugin is unavailable'

export function createHostApis() {
  const rpc = useRpc()
  const apiBase = useApiBase()
  const connection = useConnected()
  const notices = useNotices()
  const systemDark = createMediaQuery('(prefers-color-scheme: dark)')
  const [attachState, setAttachState] = createSignal(createHostApiAttachState<Attached>())
  const attached = createMemo(() => selectAttached(attachState()))
  const memory = new Map<string, ReturnType<Storage['memory']>>()
  const current = () => attached()
  const located = createLocatedWrites()
  const client = Conciv.make(rpc)
  const unavailable = Conciv.make(createORPCClient<RpcClient>({call: () => Promise.reject(new Error(UNAVAILABLE))}))

  const engineVersion = useQuery(() => engineVersionQueryOptions(apiBase()))

  const engine: ServerRef = {
    id: 'engine',
    name: 'conciv',
    get url() {
      return apiBase()
    },
    client,
    local: true,
    builtin: true,
    get compatible() {
      return !(engineVersion.isSuccess && engineOlderThanWidget(engineVersion.data))
    },
    get connected() {
      return connection()
    },
  }

  const dispatchAttach = (event: HostApiAttachEvent<Attached>) => {
    const next = transitionHostApiAttach(untrack(attachState), event)

    setAttachState(next.state)
    next.effects.forEach((effect) => {
      if (effect.type === 'schedule.drain') return queueMicrotask(() => drain(effect.attempt))

      if (effect.type === 'drop') return effect.items.forEach((item) => item.onDrop?.())

      void Promise.try(() => effect.run(effect.attached)).catch((cause: unknown) => console.error('[plugin]', cause))
    })

    return next.queued
  }

  const drain = (attempt: number) =>
    batch(() => {
      while (selectDraining(untrack(attachState), attempt)) dispatchAttach({type: 'drain.next', attempt})
    })

  const write = (run: (value: Attached) => void, onDrop?: () => void) => {
    const id = dispatchAttach({type: 'write', run, onDrop})

    return () => {
      if (id !== undefined) dispatchAttach({type: 'cancel', id})
    }
  }

  if (getOwner()) onCleanup(() => dispatchAttach({type: 'disposed'}))

  const target = (
    plugin: string,
    key: string,
    scope: Exclude<StorageScope, 'global' | 'project'>,
    from: StoreFrom | readonly StoreFrom[] | undefined,
    connected: Attached,
  ) => {
    const name = storeName(plugin, key)

    if ('session' in scope) {
      const location = scope.session.location

      if (!location) throw new Error('Session storage requires a session location')

      return {...Persist.session(scope.session.id, name), copyFrom: storeImports(from)}
    }

    if (!connected.server(scope.server)) throw new Error(`Server ${scope.server} is unavailable`)

    return {...Persist.project(name), copyFrom: storeImports(from)}
  }

  const apis: HostApiFactories = {
    storage: (plugin, owner) => ({
      store<S extends StandardSchemaV1<unknown, object>>(key: string, options: StoreOptions<S>) {
        const open = (at: Parameters<typeof persisted>[0]) => {
          const pair = persisted(at, options.schema, options.initial, rpc, options.encode)

          return persistedHandle({store: pair[0], set: pair[1], init: pair[3].promise})
        }

        const scope = options.scope

        return runWithOwner(getOwner() ?? owner, () => {
          if (!scope || scope === 'global' || scope === 'project')
            return open(globalStoreTarget(plugin, key, options.from, scope ?? 'global'))

          const scoped = (connected: Attached | undefined) =>
            connected && open(target(plugin, key, scope, options.from, connected))

          if (!('session' in scope)) return deferredHandle(createMemo(on(attached, scoped)))

          const directory = createMemo(() => scope.session.location?.directory)

          return deferredHandle(
            createMemo(
              on([attached, directory], ([connected, value]) => (value === undefined ? undefined : scoped(connected))),
            ),
          )
        })!
      },
      memory<T extends object>(key: string, options: {readonly initial: T}) {
        const name = `${plugin}.${key}`
        const existing = memory.get(name)

        if (existing) {
          return existing as readonly [Store<T>, (mutation: (draft: T) => void) => void]
        }

        const [store, setStore] = createStore(options.initial)
        const value = [store, (mutation: (draft: T) => void) => setStore(produce(mutation))] as const

        memory.set(name, value)

        return value
      },
      remove(key, options) {
        const scope = options?.scope

        if (!scope || scope === 'global' || scope === 'project')
          return removePersisted(globalStoreTarget(plugin, key, options?.from, scope ?? 'global'), rpc)

        const run = (connected: Attached) => removePersisted(target(plugin, key, scope, options?.from, connected), rpc)

        write((connected) => {
          if (!('session' in scope) || (scope.session.location && !located.pending(scope.session.key)))
            return run(connected)
          located.hold(scope.session, () => write(run))
        })
      },
    }),
    system: () => ({
      copy: (text) =>
        writeClipboardText(text).catch((cause: unknown) => Promise.reject(new Error('Request failed', {cause}))),
      async save(file) {
        const url = URL.createObjectURL(new Blob([file.content], {type: 'application/octet-stream'}))
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
        URL.revokeObjectURL(url)

        return true
      },
      openExternal(value) {
        if (!URL.canParse(value)) return
        const url = new URL(value)

        if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'mailto:') return
        window.open(url.href, '_blank', 'noopener,noreferrer')
      },
    }),
    desktop: () => ({
      launch: (path, position) =>
        rpc.editor.open({file: path, line: position?.line, column: position?.column}).then(() => undefined),
      reveal: undefined,
      installed: undefined,
      pick: undefined,
    }),
    app: () => ({
      name: 'conciv',
      version: appManifest.version,
      channel: import.meta.env.DEV ? 'dev' : 'prod',
      platform: 'web',
      packaged: false,
    }),
    appearance: () => ({
      font: () => 'var(--chat-mono)',
      mode: () => current()?.mode() ?? (systemDark() ? 'dark' : 'light'),
    }),
    router: () => ({
      routing: () => current()?.routing() ?? false,
      path: () => current()?.path() ?? '',
    }),
    keybinds: () => ({
      keybind: () => [],
      keys: (bind) => (!bind || bind === 'none' ? [] : formatForDisplay(bind, {parts: true})),
      matches: () => false,
    }),
    servers: () => ({
      list: () => current()?.servers() ?? [],
      get: (id) => current()?.server(id),
    }),
    sessions: () => ({
      list: () => current()?.sessions() ?? [],
      current: () => current()?.current(),
    }),
    tabs: () => ({
      list: () => current()?.tabs.list() ?? [],
      open: (session, options) => write((value) => value.tabs.open(session, options)),
      focus: (key) => write((value) => value.tabs.focus(key)),
      move: undefined,
      close: (key) => write((value) => value.tabs.close(key)),
    }),
    toast: (_plugin, owner, _context, register) => ({
      show(options) {
        const shown = notices.notify(options.title, {
          description: options.description,
          tone: TOAST_TONE[options.variant ?? 'default'],
          loading: options.variant === 'loading',
          icon: options.icon && icons[options.icon],
          duration: options.duration,
          persist: options.persistent,
          actions: options.actions?.map((action) => ({
            label: action.label,
            run: () => void Promise.try(() => action.run()).catch((cause: unknown) => console.error('[plugin]', cause)),
          })),
        })

        const dismiss = () => shown.dismiss()

        return {dismiss: runWithOwner(owner, () => register(dismiss)) ?? dismiss}
      },
    }),
    attention: () => undefined,
    commands: () => undefined,
    screen: () => ({
      current: () => {
        const attached = current()

        return attached?.current() ? attached.screen() : undefined
      },
    }),
    layout: (plugin) => ({
      narrow: undefined,
      ready: () => true,
      open: (key, session, options) => write((value) => value.layout.open(key, session, options)),
      close: (key, session) => write((value) => value.layout.close(key, session)),
      toggle: (key, session) => write((value) => value.layout.toggle(key, session)),
      hide: (key, session) => write((value) => value.layout.hide(key, session)),
      state: (key, session) => current()?.layout.state(key, session) ?? 'closed',
      stored: (session) => current()?.layout.stored(plugin, session) ?? [],
      scroll: undefined,
      settings: (page) => write((value) => value.settings(page)),
      draft: (input) => write((value) => value.draft(plugin, input)),
    }),
    ui: () => ui,
  }

  return {
    apis,
    engine,
    unavailableClient: (): ConcivClient => unavailable,
    whenMounted: (run: () => void) => write(() => run()),
    attach(value: Attached) {
      dispatchAttach({type: 'attach', attached: value})
      const attempt = selectAttachAttempt(untrack(attachState))

      return () => void dispatchAttach({type: 'detach', attempt})
    },
  }
}

export type HostApis = ReturnType<typeof createHostApis>

export {PluginAttachmentProvider, usePluginAttachment} from './attachment'

function useRoutedSessions() {
  const params = useParams({strict: false})
  const search = useSearch({strict: false})

  return createMemo(() => {
    const id = params().sessionId

    if (id !== undefined) return {shown: [id], routed: id, view: params().view, quick: false}
    const panes = search().panes

    if (panes === undefined) return {shown: [], routed: undefined, view: undefined, quick: false}
    const shown = quickPaneIds({panes, focus: search().focus ?? 0})

    return {shown, routed: shown[search().focus ?? 0], view: undefined, quick: true}
  })
}

export function createPluginAttachment(apis: HostApis) {
  const host = usePluginHost()
  const rpc = useRpc()
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const connection = useConnected()
  const theme = useHostTheme()
  const router = useRouter()
  const instances = useInstances()
  const route = useRoutedSessions()
  const engine = apis.engine
  const [screen, setScreen] = createSignal<SessionScreen>()
  const [routedView, setRoutedView] = createSignal<Accessor<MountedSession | undefined>>()
  const [composer, setComposer] = createSignal<ComposerBinder>()
  const refs = new Map<string, SessionRef>()

  const project = useQuery(() => ({...appData.utils.tabs.list.queryOptions(), enabled: connection()}))

  const sessionKey = (id: string) => `${engine.id}\n${id}`

  const sessions = createMemo(() => {
    const shown = new Set(route().shown.map(sessionKey))
    Array.from(refs).forEach(([key]) => {
      if (!shown.has(key)) refs.delete(key)
    })
    route().shown.forEach((id) => {
      const key = sessionKey(id)

      if (refs.has(key)) return
      refs.set(key, {
        key,
        id,
        tab: id,
        server: engine,
        pending: false,
        get location() {
          const root = project.data?.project.root

          return root === undefined ? undefined : {directory: root}
        },
      })
    })

    return Array.from(refs.values())
  })

  const routed = createMemo(() => {
    const id = route().routed

    return id === undefined ? undefined : sessionKey(id)
  })

  const current = createMemo(() => {
    const key = routed()
    const view = routedView()?.()

    return key && view?.key === key ? view : undefined
  })

  const phone = createMediaQuery(PHONE_MEDIA_QUERY)
  const mobileViews = createMobileViews()

  const mobileView = createMemo(() => {
    const view = route().view

    return phone() && view !== undefined && mobileViews.find(view) ? view : 'session'
  })

  const located = createLocatedWrites()

  const shownView = (session: SessionRef) => (route().routed === session.id ? route().view : undefined)

  const [region, setRegion] = createSignal<Region>()

  const mountedRegion = (session: SessionRef) => (current()?.key === session.key ? region() : undefined)

  const state = (key: string, session: SessionRef): PanelState => {
    const mounted = mountedRegion(session)
    const shown = mounted ? mounted.active() : shownView(session)

    return shown === key ? 'visible' : 'closed'
  }

  const show = (key: string, session: SessionRef) =>
    void router.navigate({to: '/panel/$sessionId/$view', params: {sessionId: session.id, view: key}})

  const chat = (session: SessionRef) => void router.navigate({to: '/panel/$sessionId', params: {sessionId: session.id}})

  const open = (key: string, session: SessionRef) => located.hold(session, () => show(key, session))

  const hide = (key: string, session: SessionRef) =>
    located.hold(session, () => {
      if (state(key, session) === 'visible') chat(session)
    })

  const closeAt = (key: string, session: SessionRef) => {
    const mounted = mountedRegion(session)

    if (mounted) return mounted.close(key)

    if (state(key, session) === 'visible') chat(session)
  }

  const close = (key: string, session: SessionRef) => located.hold(session, () => closeAt(key, session))

  const toggle = (key: string, session: SessionRef) =>
    located.hold(session, () => (state(key, session) === 'visible' ? closeAt(key, session) : show(key, session)))

  const shellTabs = createMemo((): readonly ShellTab[] =>
    sessions().map((session) => ({key: session.tab, session, active: session.id === route().routed})),
  )

  const openSession: Tabs['open'] = (session, options) => {
    if (session.server !== engine.id || !options?.focus) return
    void router.navigate({to: '/panel/$sessionId', params: {sessionId: session.id}})
  }

  const shell: Omit<Tabs, 'move'> = {
    list: shellTabs,
    open: openSession,
    focus(key) {
      const shown = untrack(route)
      const index = shown.shown.indexOf(key)

      if (index === -1) return

      if (!shown.quick) return void router.navigate({to: '/panel/$sessionId', params: {sessionId: key}})
      void router.navigate({to: '/quick', search: quickSearchFor(shown.shown, index), replace: true})
    },
    close: () => undefined,
  }

  const draft = (plugin: string, input: Parameters<Layout['draft']>[0]) =>
    void queryClient
      .ensureQueryData(appData.utils.tabs.list.queryOptions())
      .then(async ({project: listed}) => {
        if (input.server !== engine.id || input.directory !== listed.root)
          return console.error(
            `[plugin] ${plugin}: a draft runs in ${listed.root} on the server "${engine.id}", not in ${input.directory} on "${input.server}"`,
          )
        const {sessionId} = await rpc.sessions.create(undefined)
        await appendDraft(rpc, sessionId, input.prompt)
        void appData.invalidateSession(sessionId)
        await router.navigate({to: '/panel/$sessionId', params: {sessionId}})
      })
      .catch((cause: unknown) => console.error(`[plugin] ${plugin}: the draft did not open`, cause))

  const mounted: Attached = {
    sessions,
    current,
    tabs: shell,
    mode: () => theme().scheme,
    screen,
    draft,
    routing: useRouterState({select: (value) => value.status === 'pending'}),
    path: useLocation({select: (location) => `${location.pathname}${location.searchStr}`}),
    servers: () => [engine.id],
    server: (id) => (id === engine.id ? engine : undefined),
    settings(page) {
      const sessionId = untrack(route).routed

      if (sessionId === undefined || (page !== undefined && page !== 'general')) return
      void router.navigate({to: '/panel/$sessionId/settings/general', params: {sessionId}})
    },
    layout: {
      open,
      close,
      toggle,
      hide,
      state,
      stored(plugin, session) {
        const prefix = `${plugin}:`
        const view = shownView(session)

        return view?.startsWith(prefix) ? [view.slice(prefix.length)] : []
      },
    },
  }

  const recheckPluginView = () => {
    const location = router.state.location
    const views = router
      .matchRoutes(location.pathname, location.search)
      .flatMap((match) => (match.routeId === '/panel/$sessionId/$view' ? [match.params.view] : []))
    const extensionViews = collectViews(instances)

    if (!views.some((view) => isPluginView(view, extensionViews))) return
    void router.invalidate().catch((cause: unknown) => console.error('[plugin] Route check failed', cause))
  }

  return {
    engine,
    attach: () => {
      const detach = apis.attach(mounted)

      recheckPluginView()

      return detach
    },
    current,
    mobile: {
      current: mobileView,
      select(view: string) {
        const session = current()

        if (!session) return
        if (view === 'session') return chat(session)
        show(view, session)
      },
    },
    screen(value: SessionScreen) {
      setScreen(() => value)

      return () => {
        if (screen() === value) setScreen(undefined)
      }
    },
    shownRegion: region,
    shownScreen: screen,
    composer,
    bindComposer(value: ComposerBinder) {
      setComposer(() => value)

      return () => {
        if (composer() === value) setComposer(undefined)
      }
    },
    region(value: Region) {
      setRegion(() => value)
      recheckPluginView()

      return () => {
        if (region() === value) setRegion(undefined)
      }
    },
    mount(view: Accessor<MountedSession | undefined>) {
      setRoutedView(() => view)

      return () => {
        if (routedView() === view) setRoutedView(undefined)
      }
    },
    preload(view: MountedSession) {
      untrack(() => host.preload(view))
    },
  }
}
