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
import {useMutation, useQuery} from '@tanstack/solid-query'
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
import Settings from 'lucide-solid/icons/settings'
import Pencil from 'lucide-solid/icons/pencil'
import PictureInPicture2 from 'lucide-solid/icons/picture-in-picture-2'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import ShieldCheck from 'lucide-solid/icons/shield-check'
import Unplug from 'lucide-solid/icons/unplug'
import {Show, Suspense, createEffect, createMemo, createSignal, on, onMount, type JSX} from 'solid-js'
import {z} from 'zod'
import {isSessionId} from '@conciv/protocol/chat-types'
import {
  useAnnounce,
  useAppData,
  useAppQueryClient,
  useChatDeps,
  useDisconnect,
  useGrabProvider,
  useInstances,
  useLiveSessions,
  usePaneChat,
  usePreferences,
  useSettings,
} from '../app/context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from '../app/pane-context.js'
import {makeGrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'
import {SessionSelector} from '../composer/session-selector.js'
import {usePanelChrome} from '../app/panel-chrome.js'
import {ContextSummary} from '../pane/context-tracker.js'
import {StatusBar, type StatusBarView} from '../pane/status-bar.js'
import {makeRefreshCoordinator} from '../pane/refresh-coordinator.js'
import {SessionPillPending, UsagePending} from '../shell/pending.js'
import {guardedComponent} from '../extension/extension-boundary.js'
import {collectViews} from '../extension/extension-views.js'
import {arrangeViews} from '../settings/arrange-views.js'
import {useNotices} from '../shell/notice-context.js'
import {openPipTarget} from '../shell/pip.js'

const RAIL =
  'flex h-15 shrink-0 box-border items-center gap-2.5 pe-3 ps-5 pt-[13px] pb-[13px] [border-block-end:1px_solid_var(--chat-line-soft)]'
const RAIL_LEFT = 'flex flex-1 flex-col justify-center min-w-0 gap-[3px]'
const RAIL_MICROLABEL =
  '[font-family:var(--chat-mono)] text-[length:var(--chat-text-micro)] leading-[1.2] uppercase tracking-[0.14em] [color:var(--chat-microlabel)] whitespace-nowrap'
const RAIL_SEPARATOR = 'chat-rail-context-full [color:var(--chat-separator)] px-[5px]'
const RAIL_TITLE_ROW =
  'group flex items-center gap-1 min-w-0 min-h-7 [font-family:var(--chat-font-display)] text-[14.5px] leading-[1.25] font-semibold tracking-[-0.012em] [color:var(--chat-text-hi)]'
const RAIL_TITLE = 'min-w-0 truncate'
const RAIL_TITLE_TRIGGER =
  '!justify-start gap-1.5 min-w-0 p-0 text-start [font:inherit] [letter-spacing:inherit] [color:inherit] rounded-[var(--chat-radius-sm)] focus-ring aria-busy:cursor-progress'
const RAIL_TITLE_RENAME =
  'size-7 shrink-0 [&[hidden]]:hidden opacity-0 [transition:opacity_120ms_var(--chat-ease)] motion-reduce:[transition:none] group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'
const GHOST =
  'bg-transparent border border-transparent text-chat-text-2 cursor-pointer inline-flex items-center justify-center size-7 rounded-[var(--chat-radius-sm)] [transition:background-color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill)] hover:[border-color:var(--chat-line-soft)] hover:text-chat-text'
const RAIL_MENU_CONTENT = 'p-2 flex flex-col gap-1 w-72'
const RAIL_MENU_CONTENT_STYLE = {
  background: 'var(--chat-bg)',
  'border-color': 'var(--chat-line)',
  'border-radius': 'var(--chat-radius-md)',
}
const RAIL_MENU_LABEL =
  '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.1em] [color:var(--chat-microlabel)] px-1 pt-1'
const RAIL_MENU_SEPARATOR = 'w-full border-0 [border-block-start:1px_solid_var(--chat-line-soft)] my-0.5'
const RAIL_MENU_ROW =
  '!justify-start gap-2 px-1 py-1.5 rounded-[var(--chat-radius-sm)] text-[12.5px] [color:var(--chat-text-2)] w-full text-start focus-ring [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill)] hover:[color:var(--chat-text-hi)] disabled:opacity-40 disabled:cursor-default'

const POP_OUT_LOST_KEY = 'pop-out-lost'
const SLIDE_CLASS = {right: 'anim-tab-right', left: 'anim-tab-left', none: ''}

const panelSessionSearchSchema = z.object({
  popOut: z.literal('lost').optional().catch(undefined),
})

export const Route = createFileRoute('/panel/$sessionId')({
  validateSearch: panelSessionSearchSchema,
  beforeLoad: async ({context, params}) => {
    if (isSessionId(params.sessionId)) return
    const {sessionId} = await context.rpc.sessions.resolve({id: params.sessionId})
    throw redirect({to: '/panel/$sessionId', params: {sessionId}, replace: true})
  },
  component: PanelSession,
})

function SessionTitle(props: {
  sessionId: string
  savedTitle: string | undefined
  loading: boolean
  refreshing: boolean
}): JSX.Element {
  const appData = useAppData()
  const {rpc} = useChatDeps()
  const announce = useAnnounce()
  const rename = useMutation(() => ({
    mutationFn: (input: {sessionId: string; title: string}) => rpc.sessions.rename(input),
    onSuccess: (result: {title: string}) => announce(`Renamed to ${result.title}`),
    onError: () => announce('Rename failed', true),
    onSettled: () => appData.invalidateSessions(),
  }))
  const title = () => {
    if (rename.isPending && rename.variables?.sessionId === props.sessionId) return rename.variables.title
    if (props.loading) return ''
    return props.savedTitle || 'New session'
  }
  const label = () => `${title() || 'Session'}, ${props.refreshing ? 'refreshing the conversation' : 'session options'}`
  const commit = (value: string) => {
    const next = value.trim()
    if (!next || next === title()) return
    rename.mutate({sessionId: props.sessionId, title: next})
  }
  return (
    <Editable.Root
      class={RAIL_TITLE_ROW}
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

function AllowOutsideAgentsRow(props: {sessionId: string}): JSX.Element {
  const appData = useAppData()
  const {rpc} = useChatDeps()
  const outsideAccess = useQuery(() =>
    appData.utils.chat.outsideAccess.queryOptions({input: {sessionId: props.sessionId}}),
  )
  const allowOutside = useMutation(() => ({
    mutationFn: () => rpc.chat.allowOutside({sessionId: props.sessionId}),
    onSuccess: appData.invalidateOutsideAccess,
  }))
  return (
    <Show when={outsideAccess.isSuccess && outsideAccess.data.denied}>
      <Button
        variant="plain"
        size="none"
        class={RAIL_MENU_ROW}
        disabled={allowOutside.isPending}
        onClick={() => allowOutside.mutate()}
      >
        <ShieldCheck class="size-4 block shrink-0" aria-hidden="true" />
        Allow outside agents
      </Button>
    </Show>
  )
}

function showPopOutLost(lost: () => boolean, popOut: () => void): void {
  const notices = useNotices()
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
  const {rpc} = useChatDeps()
  const queryClient = useAppQueryClient()
  const announce = useAnnounce()
  const instances = useInstances()
  const {connectMode, disconnect} = useDisconnect()
  const grabProvider = useGrabProvider()
  const router = useRouter()
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
  const running = () => row()?.running ?? chat().runInProgress()

  const preferences = usePreferences()
  const views = createMemo(() => arrangeViews(collectViews(instances), preferences.stored()))
  const activeView = () => sessionMenu.view() ?? 'chat'
  const [viewLocks, setViewLocks] = createSignal<Record<string, boolean>>({})
  const setLockedFor = (id: string) => (locked: boolean) => setViewLocks((prev) => ({...prev, [id]: locked}))
  const viewLocked = () => activeView() !== 'chat' && Boolean(viewLocks()[activeView()])

  const tabIndex = (id: string) => (id === 'chat' ? 0 : views().findIndex((view) => view.id === id) + 1)
  const [slideDir, setSlideDir] = createSignal<'left' | 'right' | null>(null)
  const slideClass = () => SLIDE_CLASS[slideDir() ?? 'none']

  const switchView = (next: string) => {
    if (next === activeView()) return
    setSlideDir(tabIndex(next) > tabIndex(activeView()) ? 'right' : 'left')
    const view = views().find((candidate) => candidate.id === next)
    announce(view ? view.label : 'Chat')
    if (next === 'chat')
      void router.navigate({to: '/panel/$sessionId', params: {sessionId: params().sessionId}, replace: true})
    else
      void router.navigate({
        to: '/panel/$sessionId/$view',
        params: {sessionId: params().sessionId, view: next},
        replace: true,
      })
  }

  const activate = sessionMenu.activate
  const newSession = async () => {
    const {sessionId} = await rpc.sessions.create(undefined)
    appData.invalidateSessions()
    activate(sessionId)
    announce('Started a new session')
  }

  const grabStaging = makeGrabStaging({
    ground: (grab) => resolveGrabSource(grab, (input) => rpc.page.symbolicate(input)),
  })

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
    runError: chat().runError(),
    stopped: chat().stopped(),
  }))
  // oxlint-disable-next-line solid/reactivity
  const diff = sessionTotals(() => turns())
  const clock = createRunClock(() => chat().runSource())
  const elapsedLabel = () => {
    const state = clock()
    return state.elapsedMs === null ? '--' : formatElapsed(state.elapsedMs)
  }
  const lastTask = () => sessionStatus().kind === 'done' || sessionStatus().kind === 'stopped'
  const taskContext = () => (lastTask() ? 'LAST TASK' : 'ACTIVE TASK')
  const statusBarViews = createMemo<StatusBarView[]>(() => [
    {id: 'chat', label: 'Chat'},
    ...views().map((view) => ({
      id: view.id,
      label: view.label,
      icon: view.icon && guardedComponent(view.instance.extension.name, 'silent', view.icon),
    })),
  ])

  const paneValue: PaneContextValue = {
    sessionId: () => params().sessionId,
    running,
    viewLocked,
    setLockedFor,
    slideClass,
    resetSlide: () => setSlideDir(null),
    grabStaging,
    grabProvider,
    attachments: makePendingAttachmentQueue(),
    newSession: () => void newSession(),
    chat,
    refresh: coordinator.refresh,
    isRefreshing: coordinator.isRefreshing,
  }

  return (
    <PaneContext.Provider value={paneValue}>
      <header class={RAIL}>
        <Popover.Root
          positioning={{placement: 'bottom-start'}}
          open={sessionMenu.open()}
          onOpenChange={(details) => sessionMenu.setOpen(details.open)}
        >
          <div class={RAIL_LEFT}>
            <span class={RAIL_MICROLABEL}>
              <span class="chat-rail-context-full">
                CONCIV <span class={RAIL_SEPARATOR}>/</span> {taskContext()}
              </span>
              <span class="chat-rail-context-narrow">{lastTask() ? 'LAST' : 'ACTIVE'}</span>
            </span>
            <SessionTitle
              sessionId={params().sessionId}
              savedTitle={row()?.title}
              loading={session.isPending}
              refreshing={coordinator.isRefreshing()}
            />
          </div>
          <Popover.Positioner>
            <Popover.Content aria-label="Session options" class={RAIL_MENU_CONTENT} style={RAIL_MENU_CONTENT_STYLE}>
              <span class={RAIL_MENU_LABEL}>Session</span>
              <Suspense fallback={<SessionPillPending variant="bar" />}>
                <SessionSelector
                  variant="bar"
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
                      {...closeProps({'aria-label': 'Refresh the conversation', onClick: () => coordinator.refresh()})}
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
              <AllowOutsideAgentsRow sessionId={params().sessionId} />
              <Button variant="plain" size="none" class={RAIL_MENU_ROW} onClick={popOut}>
                <PictureInPicture2 class="size-4 block shrink-0" aria-hidden="true" />
                Pop out to a window
              </Button>
              <Show when={connectMode && disconnect}>
                <Button variant="plain" size="none" class={RAIL_MENU_ROW} onClick={() => disconnect?.()}>
                  <Unplug class="size-4 block shrink-0" aria-hidden="true" />
                  Disconnect this machine
                </Button>
              </Show>
            </Popover.Content>
          </Popover.Positioner>
        </Popover.Root>
        <SettingsLink sessionId={params().sessionId} />
        <CloseChatButton />
      </header>
      <Outlet />
      <StatusBar
        status={sessionStatus()}
        elapsedLabel={elapsedLabel()}
        diff={diff()}
        views={statusBarViews()}
        activeView={activeView()}
        onSelectView={switchView}
        disabled={viewLocked()}
      />
    </PaneContext.Provider>
  )
}

function useSessionMenu(sessionId: () => string): {
  view: () => string | undefined
  open: () => boolean
  setOpen: (open: boolean) => void
  activate: (id: string) => void
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
  const activate = (id: string) => {
    if (id === sessionId() && open()) return hide()
    void router.navigate({to: '/panel/$sessionId', params: {sessionId: id}, replace: open()})
  }
  return {view, open, setOpen, activate}
}
