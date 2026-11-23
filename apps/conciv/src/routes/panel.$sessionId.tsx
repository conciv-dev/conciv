import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useCanGoBack,
  useMatch,
  useMatchRoute,
  useRouter,
} from '@tanstack/solid-router'
import {useMutation, useQuery} from '@conciv/client'
import {Button, Editable, Popover, TooltipIconButton, TooltipIconButtonSlot, TruncatedText} from '@conciv/ui-kit-system'
import {
  coalesceTurns,
  createRunClock,
  createSessionStatus,
  formatElapsed,
  sessionTotals,
  turnRollup,
  type TurnRollup,
} from '@conciv/ui-kit-chat'
import X from 'lucide-solid/icons/x'
import MessageSquare from 'lucide-solid/icons/message-square'
import Settings from 'lucide-solid/icons/settings'
import Pencil from 'lucide-solid/icons/pencil'
import PictureInPicture2 from 'lucide-solid/icons/picture-in-picture-2'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import {Show, Suspense, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX} from 'solid-js'
import {z} from 'zod'
import {ORPCError} from '@orpc/client'
import {
  useAnnounce,
  useAppData,
  useAppQueryClient,
  useGrabProvider,
  useLiveSessions,
  usePaneChat,
  useRpc,
  useSettings,
} from '../app/context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from '../app/pane-context.js'
import {useGrabStaging} from '../app/use-grab-staging.js'
import {makePaneGrabApi} from '../pane/pane-grab.js'
import {PaneGrabBinding} from '../pane/plugin-session-parts.js'
import {SessionSelector} from '../composer/session-selector.js'
import {usePanelChrome} from '../app/panel-chrome.js'
import {ContextSummary} from '../pane/context-tracker.js'
import {StatusBar, type StatusBarView} from '../pane/status-bar.js'
import {PaneAlert} from '../pane/pane-alert.js'
import {makeRefreshCoordinator} from '../pane/refresh-coordinator.js'
import {SessionPillPending, UsagePending} from '../shell/pending.js'
import {useNotices} from '../shell/notice-context.js'
import {useStartSession} from '../app/start-session.js'
import {openPipTarget} from '../shell/pip.js'
import {createMountedSession} from '../runtime/plugin/mounted-session.js'
import {createPluginTabs, PluginRegion, PluginWindowBottom} from '../shell/plugin-surfaces.js'

const RAIL =
  'flex h-15 shrink-0 box-border items-center gap-2.5 pe-3 ps-5 pt-[13px] pb-[13px] [border-block-end:1px_solid_var(--chat-line-soft)]'
const RAIL_LEFT = 'flex flex-1 flex-col justify-center min-w-0 gap-[3px]'
const RAIL_MICROLABEL =
  '[font-family:var(--chat-mono)] text-[length:var(--chat-text-micro)] leading-[1.2] uppercase tracking-[0.14em] [color:var(--chat-microlabel)] whitespace-nowrap'
const RAIL_SEPARATOR = 'chat-rail-context-full [color:var(--chat-separator)] px-[5px]'
const RAIL_TITLE_ROW =
  'group flex items-center gap-1 min-w-0 min-h-7 [font-family:var(--chat-font-display)] text-[14.5px] leading-[1.25] font-semibold tracking-[-0.012em] [color:var(--chat-text-hi)]'
const RAIL_TITLE = 'min-w-0 truncate'
const RAIL_TITLE_LINE = 'flex items-center gap-2 min-w-0'
const ROW_FAILED = 'Couldn’t load this session'
const ROW_FAILED_LABEL = 'This session could not be loaded'
const RAIL_TITLE_TRIGGER =
  '!justify-start gap-1.5 min-w-0 p-0 text-start [font:inherit] [letter-spacing:inherit] [color:inherit] rounded-chat-sm focus-ring aria-busy:cursor-progress'
const RAIL_TITLE_RENAME =
  'size-7 shrink-0 [&[hidden]]:hidden opacity-0 [transition:opacity_120ms_var(--chat-ease)] motion-reduce:[transition:none] group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'
const GHOST =
  'bg-transparent border border-transparent text-chat-text-2 cursor-pointer inline-flex items-center justify-center size-7 rounded-chat-sm [transition:background-color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill)] hover:[border-color:var(--chat-line-soft)] hover:text-chat-text'
const RAIL_MENU_CONTENT = 'p-2 w-72'
const RAIL_MENU_CONTENT_STYLE = {
  background: 'var(--chat-bg)',
  'border-color': 'var(--chat-line)',
  'border-radius': 'var(--chat-radius-md)',
}
const RAIL_MENU_LABEL =
  '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.1em] [color:var(--chat-microlabel)] px-1 pt-1'
const RAIL_MENU_SEPARATOR = 'w-full border-0 [border-block-start:1px_solid_var(--chat-line-soft)] my-0.5'
const RAIL_MENU_ROW =
  '!justify-start gap-2 px-1 py-1.5 rounded-chat-sm text-[12.5px] [color:var(--chat-text-2)] w-full text-start focus-ring [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill)] hover:[color:var(--chat-text-hi)] disabled:opacity-40 disabled:cursor-default'

const POP_OUT_LOST_KEY = 'pop-out-lost'
const SLIDE_CLASS = {right: 'anim-tab-right', left: 'anim-tab-left', none: ''}

const panelSessionSearchSchema = z.object({
  popOut: z.literal('lost').optional().catch(undefined),
})

export const Route = createFileRoute('/panel/$sessionId')({
  validateSearch: panelSessionSearchSchema,
  beforeLoad: async ({context, params}) => {
    const resolved = await context.queryClient
      .ensureQueryData(context.data.utils.sessions.resolve.queryOptions({input: {id: params.sessionId}}))
      .catch((error: unknown) => {
        if (error instanceof ORPCError && error.code === 'NOT_FOUND')
          throw redirect({to: '/panel/latest', search: true, replace: true})
        throw error
      })
    if (resolved.sessionId === params.sessionId) return
    throw redirect({to: '/panel/$sessionId', params: {sessionId: resolved.sessionId}, replace: true})
  },
  loader: async ({context, params}) => {
    await context.queryClient
      .query({
        ...context.data.utils.sessions.get.queryOptions({input: {sessionId: params.sessionId}}),
        staleTime: 'static',
      })
      .catch((error: unknown) => console.error('[conciv] the session row did not load before the panel', error))
  },
  component: PanelSession,
})

function SessionTitle(props: {
  sessionId: string
  savedTitle: string | undefined
  loading: boolean
  failed: boolean
  refreshing: boolean
}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const rename = useMutation(() => ({
    mutationFn: (input: {sessionId: string; title: string}) => rpc.sessions.rename(input),
    onSuccess: (result: {title: string}) => announce(`Renamed to ${result.title}`),
    onError: () => announce('Rename failed', true),
    onSettled: (_result, _error, input) => appData.invalidateSession(input.sessionId),
  }))
  const title = () => {
    if (rename.isPending && rename.variables?.sessionId === props.sessionId) return rename.variables.title
    if (props.loading) return ''
    if (props.failed) return 'Session'
    return props.savedTitle || 'New session'
  }
  const name = () => (props.failed ? ROW_FAILED_LABEL : title() || 'Session')
  const label = () => `${name()}, ${props.refreshing ? 'refreshing the conversation' : 'session options'}`
  const commit = (value: string) => {
    const next = value.trim()
    if (!next || next === title()) return
    rename.mutate({sessionId: props.sessionId, title: next})
  }
  return (
    <Editable.Root
      class={props.failed ? RAIL_TITLE_ROW : `${RAIL_TITLE_ROW} flex-1`}
      activationMode="none"
      translations={{edit: 'Rename session', input: 'Session title'}}
      onValueCommit={(details) => commit(details.value)}
    >
      <Editable.Context>
        {(titleEditor) => (
          <>
            <Editable.Area class={titleEditor().editing ? 'flex-1' : undefined}>
              <Editable.Input />
              <Show when={!titleEditor().editing}>
                <Popover.Trigger
                  asChild={(triggerProps) => (
                    <Button
                      {...triggerProps()}
                      variant="plain"
                      size="none"
                      class={RAIL_TITLE_TRIGGER}
                      aria-label={label()}
                      aria-busy={props.refreshing || rename.isPending}
                    >
                      <TruncatedText class={RAIL_TITLE} text={title()} side="bottom" />
                      <Show when={props.refreshing}>
                        <RefreshCw
                          class="size-3.5 block shrink-0 [color:var(--chat-text-2)] [transform-origin:center] anim-tool-spin"
                          aria-hidden="true"
                        />
                      </Show>
                    </Button>
                  )}
                />
              </Show>
            </Editable.Area>
            <TooltipIconButtonSlot tooltip="Rename session" class={RAIL_TITLE_RENAME} side="bottom">
              {(buttonProps) => (
                <Editable.EditTrigger
                  asChild={(triggerProps) => (
                    <button {...buttonProps()} {...triggerProps({onClick: () => titleEditor().setValue(title())})}>
                      <Pencil class="size-3.5 block" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                />
              )}
            </TooltipIconButtonSlot>
          </>
        )}
      </Editable.Context>
    </Editable.Root>
  )
}

function SettingsLink(props: {sessionId: string}): JSX.Element {
  const router = useRouter()
  const restoring = router.state.location.state.restoreFocus === 'settings'
  let link: HTMLAnchorElement | undefined
  onMount(() => {
    if (restoring) link?.focus()
  })
  return (
    <TooltipIconButtonSlot tooltip="Settings" class={GHOST} side="bottom">
      {(buttonProps) => (
        <Link
          class={buttonProps().class}
          aria-label={buttonProps()['aria-label']}
          aria-describedby={buttonProps()['aria-describedby']}
          ref={(element) => {
            link = element
          }}
          to="/panel/$sessionId/settings"
          params={{sessionId: props.sessionId}}
        >
          <Settings class="size-3.5 block" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      )}
    </TooltipIconButtonSlot>
  )
}

function CloseChatButton(): JSX.Element {
  const panelChrome = usePanelChrome()
  const settings = useSettings()
  return (
    <Show when={settings.surface !== 'dock'}>
      <TooltipIconButton tooltip="Close chat" class={GHOST} onClick={() => panelChrome.close()}>
        <X class="size-3.5 block" strokeWidth={1.75} aria-hidden="true" />
      </TooltipIconButton>
    </Show>
  )
}

function showPopOutLost(lost: () => boolean, popOut: () => void): void {
  const notices = useNotices()
  onCleanup(() => notices.remove(POP_OUT_LOST_KEY))
  createEffect(
    on(lost, (isLost) => {
      if (!isLost) {
        notices.remove(POP_OUT_LOST_KEY)
        return
      }
      notices.notify('The pop-out window could not be reopened.', {
        key: POP_OUT_LOST_KEY,
        action: {label: 'Pop out again', run: popOut},
      })
    }),
  )
}

function PanelSession(): JSX.Element {
  const params = Route.useParams()
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  const announce = useAnnounce()
  const grabProvider = useGrabProvider()
  const router = useRouter()
  const navigate = Route.useNavigate()
  const sessionMenu = useSessionMenu(() => params().sessionId)
  const search = Route.useSearch()
  const popOut = () => {
    const sessionId = params().sessionId
    if (openPipTarget()) {
      void router.navigate({to: '/pip/$sessionId', params: {sessionId}})
      return
    }
    void router.navigate({
      to: '/panel/$sessionId',
      params: {sessionId},
      search: {popOut: 'lost', open: true},
      replace: true,
    })
  }
  showPopOutLost(() => search().popOut === 'lost', popOut)

  const chat = usePaneChat(() => params().sessionId)
  const session = useQuery(() => appData.utils.sessions.get.queryOptions({input: {sessionId: params().sessionId}}))
  const row = () => (session.isPending ? undefined : session.data)
  const usage = () => row()?.usage ?? null

  const activeView = () => sessionMenu.view() ?? 'chat'

  const tabIndex = (id: string) => statusBarViews().findIndex((view) => view.id === id)
  const [slideDir, setSlideDir] = createSignal<'left' | 'right' | null>(null)
  const slideClass = () => SLIDE_CLASS[slideDir() ?? 'none']

  const showChat = () =>
    void router.navigate({to: '/panel/$sessionId', params: {sessionId: params().sessionId}, replace: true})
  const showView = (view: string) =>
    void router.navigate({to: '/panel/$sessionId/$view', params: {sessionId: params().sessionId, view}, replace: true})

  const switchView = (next: string) => {
    if (next === activeView()) return
    setSlideDir(tabIndex(next) > tabIndex(activeView()) ? 'right' : 'left')
    const view = statusBarViews().find((candidate) => candidate.id === next)
    announce(view ? view.label : 'Chat')
    if (next === 'chat') return showChat()
    showView(next)
  }

  const mounted = createMountedSession({id: () => params().sessionId})
  const pluginTabs = createPluginTabs({
    view: activeView,
    chat: showChat,
    show: showView,
  })

  const activate = sessionMenu.activate
  const startSession = useStartSession()
  const newSession = () =>
    startSession()
      .then(({sessionId}) => activate(sessionId))
      .then(() => announce('Started a new session'))
      .catch(() => undefined)

  const grabStaging = useGrabStaging()

  const paneGrab = makePaneGrabApi(grabStaging, grabProvider)

  const coordinator = makeRefreshCoordinator({
    chat,
    liveSessions: useLiveSessions(),
    sessionId: () => params().sessionId,
    appData,
    queryClient,
    announce,
  })

  const turns = createMemo(() => coalesceTurns(chat().messages()))
  const latestRollup = createMemo<TurnRollup | undefined>(() => {
    const turn = turns().at(-1)
    return turn ? turnRollup(turn) : undefined
  })
  const isStreaming = () => chat().runInProgress()
  const sessionStatus = createSessionStatus(() => ({
    latestRollup: latestRollup(),
    isStreaming: isStreaming(),
    queueLength: chat().queue().length,
    stopping: chat().stopping(),
    approvalPending: chat().pendingApprovals().length > 0,
    runError: chat().runError(),
    stopped: chat().stopped(),
    ran: (row()?.lastRunAt ?? null) !== null || chat().runSource() !== null,
  }))
  // oxlint-disable-next-line solid/reactivity
  const diff = sessionTotals(() => turns())
  const clock = createRunClock(() => chat().runSource())
  const elapsedLabel = () => {
    const state = clock()
    return state.elapsedMs === null ? '--' : formatElapsed(state.elapsedMs)
  }
  const taskContext = () => {
    const kind = sessionStatus().kind
    if (kind === 'unstarted') return undefined
    return kind === 'done' || kind === 'stopped' ? 'LAST' : 'ACTIVE'
  }
  const statusBarViews = createMemo<StatusBarView[]>(() => [
    {id: 'chat', label: 'Chat', icon: MessageSquare},
    ...pluginTabs.views(),
  ])

  const paneValue: PaneContextValue = {
    slideClass,
    resetSlide: () => setSlideDir(null),
    grabStaging,
    grabProvider,
    attachments: makePendingAttachmentQueue(),
    newSession: () => void newSession(),
    replaceSession: (sessionId) => void navigate({to: '/panel/$sessionId', params: {sessionId}}),
    chat,
    refresh: coordinator.refresh,
    isRefreshing: coordinator.isRefreshing,
  }

  return (
    <PaneContext.Provider value={paneValue}>
      <PaneGrabBinding sessionId={params().sessionId} grab={paneGrab} />
      <header class={RAIL}>
        <Popover.Root
          positioning={{placement: 'bottom-start'}}
          open={sessionMenu.open()}
          onOpenChange={(details) => sessionMenu.setOpen(details.open)}
        >
          <div class={RAIL_LEFT}>
            <span class={RAIL_MICROLABEL}>
              <Show when={taskContext()} fallback="CONCIV">
                {(context) => (
                  <>
                    <span class="chat-rail-context-full">
                      CONCIV <span class={RAIL_SEPARATOR}>/</span> {context()} TASK
                    </span>
                    <span class="chat-rail-context-narrow">{context()}</span>
                  </>
                )}
              </Show>
            </span>
            <div class={RAIL_TITLE_LINE}>
              <SessionTitle
                sessionId={params().sessionId}
                savedTitle={row()?.title}
                loading={session.isPending}
                failed={session.isError}
                refreshing={coordinator.isRefreshing()}
              />
              <Show when={session.isError}>
                <PaneAlert message={ROW_FAILED} busy={session.isFetching} onRetry={() => void session.refetch()} />
              </Show>
            </div>
          </div>
          <Popover.Positioner>
            <Popover.Content aria-label="Session options" class={RAIL_MENU_CONTENT} style={RAIL_MENU_CONTENT_STYLE}>
              <div>
                <span class={RAIL_MENU_LABEL}>Session</span>
                <Suspense fallback={<SessionPillPending />}>
                  <SessionSelector
                    activeId={() => params().sessionId}
                    onActivate={activate}
                    onNewSession={() => void newSession()}
                  />
                </Suspense>
                <hr class={RAIL_MENU_SEPARATOR} />
                <span class={RAIL_MENU_LABEL}>Context</span>
                <Suspense fallback={<UsagePending />}>
                  <ContextSummary usage={usage()} />
                </Suspense>
                <hr class={RAIL_MENU_SEPARATOR} />
                <Show when={activeView() === 'chat'}>
                  <Popover.CloseTrigger
                    asChild={(closeProps) => (
                      <Button
                        {...closeProps({
                          'aria-label': 'Refresh the conversation',
                          onClick: () => coordinator.refresh(),
                        })}
                        variant="plain"
                        size="none"
                        class={RAIL_MENU_ROW}
                        disabled={chat().runInProgress() || coordinator.isRefreshing()}
                      >
                        <RefreshCw class="size-4 block shrink-0" aria-hidden="true" />
                        Refresh the conversation
                      </Button>
                    )}
                  />
                </Show>
                <Button variant="plain" size="none" class={RAIL_MENU_ROW} onClick={popOut}>
                  <PictureInPicture2 class="size-4 block shrink-0" aria-hidden="true" />
                  Pop out to a window
                </Button>
              </div>
            </Popover.Content>
          </Popover.Positioner>
        </Popover.Root>
        <SettingsLink sessionId={params().sessionId} />
        <CloseChatButton />
      </header>
      <Show when={mounted.view()}>
        {(view) => <PluginRegion view={view} screen={mounted.screen} tabs={() => pluginTabs.tabs} />}
      </Show>
      <Outlet />
      <StatusBar
        status={sessionStatus()}
        elapsedLabel={elapsedLabel()}
        diff={diff()}
        views={statusBarViews()}
        activeView={activeView()}
        onSelectView={switchView}
      />
      <PluginWindowBottom />
    </PaneContext.Provider>
  )
}

function useSessionMenu(sessionId: () => string): {
  view: () => string | undefined
  open: () => boolean
  setOpen: (open: boolean) => void
  activate: (id: string) => Promise<void>
} {
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const canGoBack = useCanGoBack()
  const view = useMatch({from: '/panel/$sessionId/$view', shouldThrow: false, select: (match) => match.params.view})
  const chatOptionsMatch = matchRoute({to: '/panel/$sessionId/options', includeSearch: false})
  const viewOptionsMatch = matchRoute({to: '/panel/$sessionId/$view/options', includeSearch: false})
  const open = () => [chatOptionsMatch(), viewOptionsMatch()].some(Boolean)
  const openedInApp = () => open() && canGoBack() && router.state.location.state.sessionMenuOpened === true
  const show = () => {
    const activeView = view()
    if (activeView === undefined) {
      void router.navigate({
        to: '/panel/$sessionId/options',
        params: {sessionId: sessionId()},
        search: true,
        state: {sessionMenuOpened: true},
      })
      return
    }
    void router.navigate({
      to: '/panel/$sessionId/$view/options',
      params: {sessionId: sessionId(), view: activeView},
      search: true,
      state: {sessionMenuOpened: true},
    })
  }
  const hide = () => {
    if (openedInApp()) return router.history.back()
    const activeView = view()
    if (activeView === undefined) {
      void router.navigate({to: '/panel/$sessionId', params: {sessionId: sessionId()}, search: true, replace: true})
      return
    }
    void router.navigate({
      to: '/panel/$sessionId/$view',
      params: {sessionId: sessionId(), view: activeView},
      search: true,
      replace: true,
    })
  }
  const setOpen = (next: boolean) => {
    if (next === open()) return
    if (next) return show()
    hide()
  }
  const activate = async (id: string) => {
    if (id === sessionId() && open()) return hide()
    await router.navigate({to: '/panel/$sessionId', params: {sessionId: id}, replace: open()})
  }
  return {view, open, setOpen, activate}
}
