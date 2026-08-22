import {Outlet, createFileRoute, redirect, useBlocker, useMatchRoute, useRouter} from '@tanstack/solid-router'
import {useQuery} from '@tanstack/solid-query'
import {Popover, TooltipIconButton, TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {
  ChatProvider,
  chatBusy,
  coalesceTurns,
  createSessionStatus,
  createTurnClock,
  formatElapsed,
  sessionTotals,
  turnRollup,
  type TurnRollup,
} from '@conciv/ui-kit-chat'
import X from 'lucide-solid/icons/x'
import Ellipsis from 'lucide-solid/icons/ellipsis'
import PictureInPicture2 from 'lucide-solid/icons/picture-in-picture-2'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import Unplug from 'lucide-solid/icons/unplug'
import SlidersHorizontal from 'lucide-solid/icons/sliders-horizontal'
import {Show, Suspense, createMemo, createSignal, type JSX} from 'solid-js'
import {isSessionId} from '@conciv/protocol/chat-types'
import {SETTINGS_CHANGED_EVENT} from '@conciv/protocol/settings-types'
import {useChatSession} from '@conciv/client'
import {
  useAnnounce,
  useAppData,
  useConnectionGeneration,
  useDisconnect,
  useGrabProvider,
  useInstances,
  useRpc,
} from '../app/context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from '../app/pane-context.js'
import {makeGrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'
import {SessionSelector} from '../composer/session-selector.js'
import {usePanelChrome} from '../app/panel-chrome.js'
import {ContextSummary} from '../pane/context-tracker.js'
import {QueueStrip} from '../pane/queue-strip.js'
import {StatusBar, type StatusBarView} from '../pane/status-bar.js'
import {SessionPillPending, SessionTitlePending, UsagePending, ViewTabsPending} from '../shell/pending.js'
import {collectViews} from '../extension/extension-views.js'

const RAIL =
  'flex h-15 shrink-0 box-border items-center gap-2.5 pe-3 ps-5 [border-block-end:1px_solid_var(--chat-line-soft)]'
const RAIL_LEFT = 'flex flex-1 flex-col min-w-0 gap-[2px]'
const RAIL_MICROLABEL =
  '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.14em] [color:var(--chat-microlabel)] whitespace-nowrap'
const RAIL_SEPARATOR = 'chat-rail-context-full [color:var(--chat-separator)] px-[5px]'
const RAIL_TITLE =
  'min-w-0 truncate [font-family:var(--chat-font-display)] text-[14.5px] font-semibold tracking-[-0.012em] [color:var(--chat-text-hi)]'
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
  'flex items-center gap-2 px-1 py-1.5 rounded-[var(--chat-radius-sm)] text-[12.5px] [color:var(--chat-text-2)] bg-transparent [border:none] cursor-pointer w-full text-start [transition:background-color_120ms_var(--chat-ease),color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill)] hover:[color:var(--chat-text-hi)] disabled:opacity-40 disabled:cursor-default'

export const Route = createFileRoute('/panel/$sessionId')({
  beforeLoad: async ({context, params}) => {
    if (isSessionId(params.sessionId)) return
    const {sessionId} = await context.rpc.sessions.resolve({id: params.sessionId})
    throw redirect({to: '/panel/$sessionId', params: {sessionId}, replace: true})
  },
  component: PanelSession,
})

function PanelSession(): JSX.Element {
  const params = Route.useParams()
  const generation = useConnectionGeneration()
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const instances = useInstances()
  const {connectMode, disconnect} = useDisconnect()
  const grabProvider = useGrabProvider()
  const router = useRouter()
  const panelChrome = usePanelChrome()
  const matchRoute = useMatchRoute()
  const viewMatch = matchRoute({to: '/panel/$sessionId/$view'})

  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const row = () => (sessions.data ?? []).find((session) => session.id === params().sessionId)
  const usage = () => row()?.usage ?? null
  const running = () => row()?.running ?? false

  const views = createMemo(() => collectViews(instances))
  const activeView = () => {
    const match = viewMatch()
    return match ? match.view : 'chat'
  }
  const [viewLocks, setViewLocks] = createSignal<Record<string, boolean>>({})
  const setLockedFor = (id: string) => (locked: boolean) => setViewLocks((prev) => ({...prev, [id]: locked}))
  const viewLocked = () => activeView() !== 'chat' && Boolean(viewLocks()[activeView()])
  const leaveGuard = () => running() || viewLocked()

  const tabIndex = (id: string) => (id === 'chat' ? 0 : views().findIndex((view) => view.id === id) + 1)
  const [slideDir, setSlideDir] = createSignal<'left' | 'right' | null>(null)
  const slideClass = () => (slideDir() === 'right' ? 'anim-tab-right' : slideDir() === 'left' ? 'anim-tab-left' : '')

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

  const activate = (id: string) => void router.navigate({to: '/panel/$sessionId', params: {sessionId: id}})
  const newSession = async () => {
    const {sessionId} = await rpc.sessions.create(undefined)
    appData.invalidateSessions()
    activate(sessionId)
    announce('Started a new session')
  }

  const grabStaging = makeGrabStaging({
    ground: (grab) => resolveGrabSource(grab, (input) => rpc.page.symbolicate(input)),
  })

  useBlocker({
    shouldBlockFn: ({current, next}) =>
      running() && next.pathname.startsWith('/panel') && next.pathname !== current.pathname,
  })

  const chatKey = createMemo(() => ({sessionId: params().sessionId, generation: generation()}))
  const chat = createMemo(() =>
    useChatSession({
      rpc,
      sessionId: chatKey().sessionId,
      connection: {onCustom: (name) => (name === SETTINGS_CHANGED_EVENT ? appData.invalidateSettings() : undefined)},
    }),
  )

  const turns = createMemo(() => coalesceTurns(chat().messages()))
  const latestRollup = createMemo<TurnRollup | undefined>(() => {
    const turn = turns().at(-1)
    return turn ? turnRollup(turn) : undefined
  })
  const isStreaming = createMemo(() => chatBusy(chat()))
  const queue = createMemo(() => chat().queue())
  const sessionStatus = createSessionStatus(() => ({
    latestRollup: latestRollup(),
    isStreaming: isStreaming(),
    queueLength: queue().length,
  }))
  // oxlint-disable-next-line solid/reactivity
  const diff = sessionTotals(() => turns())
  // oxlint-disable-next-line solid/reactivity
  const clock = createTurnClock(() => turns(), isStreaming)
  const elapsedLabel = () => {
    const state = clock()
    return state.elapsedMs === null ? '--' : formatElapsed(state.elapsedMs)
  }
  const taskContext = () => (sessionStatus().kind === 'done' ? 'LAST TASK' : 'ACTIVE TASK')
  const taskTitle = () => row()?.title || 'New session'
  const statusBarViews = createMemo<StatusBarView[]>(() => [
    {id: 'chat', label: 'Chat'},
    ...views().map((view) => ({id: view.id, label: view.label, icon: view.icon})),
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
  }

  return (
    <PaneContext.Provider value={paneValue}>
      <header class={RAIL}>
        <div class={RAIL_LEFT}>
          <span class={RAIL_MICROLABEL}>
            <span class="chat-rail-context-full">
              CONCIV <span class={RAIL_SEPARATOR}>/</span> {taskContext()}
            </span>
            <span class="chat-rail-context-narrow">{sessionStatus().kind === 'done' ? 'LAST' : 'ACTIVE'}</span>
          </span>
          <Suspense fallback={<SessionTitlePending />}>
            <span class={RAIL_TITLE}>{taskTitle()}</span>
          </Suspense>
        </div>
        <Popover.Root positioning={{placement: 'bottom-end'}}>
          <TooltipIconButtonSlot tooltip="Session options">
            {(buttonProps) => (
              <Popover.Trigger
                asChild={(triggerProps) => (
                  <button {...buttonProps()} {...triggerProps()} class={GHOST}>
                    <Ellipsis class="size-4 block" aria-hidden="true" />
                  </button>
                )}
              />
            )}
          </TooltipIconButtonSlot>
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
                <button
                  type="button"
                  class={RAIL_MENU_ROW}
                  disabled={chatBusy(chat())}
                  onClick={() => chat().refresh()}
                >
                  <RefreshCw class="size-4 block shrink-0" aria-hidden="true" />
                  Refresh the conversation
                </button>
              </Show>
              <button
                type="button"
                class={RAIL_MENU_ROW}
                onClick={() => void router.navigate({to: '/pip/$sessionId', params: {sessionId: params().sessionId}})}
              >
                <PictureInPicture2 class="size-4 block shrink-0" aria-hidden="true" />
                Pop out to a window
              </button>
              <button type="button" class={RAIL_MENU_ROW} onClick={() => void router.navigate({to: '/panel/settings'})}>
                <SlidersHorizontal class="size-4 block shrink-0" aria-hidden="true" />
                Settings
              </button>
              <Show when={connectMode && disconnect}>
                <button type="button" class={RAIL_MENU_ROW} onClick={() => disconnect?.()}>
                  <Unplug class="size-4 block shrink-0" aria-hidden="true" />
                  Disconnect this machine
                </button>
              </Show>
            </Popover.Content>
          </Popover.Positioner>
        </Popover.Root>
        <TooltipIconButton tooltip="Close chat" class={GHOST} onClick={() => panelChrome.close()}>
          <X class="size-3.5 block" strokeWidth={1.75} aria-hidden="true" />
        </TooltipIconButton>
      </header>
      <ChatProvider chat={chat()}>
        <QueueStrip queue={queue()} />
      </ChatProvider>
      <Outlet />
      <Suspense fallback={<ViewTabsPending />}>
        <StatusBar
          status={sessionStatus()}
          elapsedLabel={elapsedLabel()}
          diff={diff()}
          views={statusBarViews()}
          activeView={activeView()}
          onSelectView={switchView}
          disabled={leaveGuard()}
        />
      </Suspense>
    </PaneContext.Provider>
  )
}
