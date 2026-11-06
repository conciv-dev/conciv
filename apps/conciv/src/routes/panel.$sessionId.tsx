import {Outlet, createFileRoute, redirect, useMatchRoute, useRouter} from '@tanstack/solid-router'
import {useMutation, useQuery} from '@tanstack/solid-query'
import {Editable, HoverCard, TooltipIconButton, TooltipIconButtonSlot, TruncatedText} from '@conciv/ui-kit-system'
import {
  ChatProvider,
  coalesceTurns,
  createRunClock,
  createSessionStatus,
  formatElapsed,
  sessionTotals,
  turnRollup,
  type TurnRollup,
} from '@conciv/ui-kit-chat'
import X from 'lucide-solid/icons/x'
import Pencil from 'lucide-solid/icons/pencil'
import PictureInPicture2 from 'lucide-solid/icons/picture-in-picture-2'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import Unplug from 'lucide-solid/icons/unplug'
import {Show, Suspense, createEffect, createMemo, createSignal, on, type JSX} from 'solid-js'
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
  useSettings,
} from '../app/context.js'
import {PaneContext, makePendingAttachmentQueue, type PaneContextValue} from '../app/pane-context.js'
import {makeGrabStaging} from '../pane/grab-staging.js'
import {resolveGrabSource} from '../pane/grab-source-resolve.js'
import {SessionSelector} from '../composer/session-selector.js'
import {usePanelChrome} from '../app/panel-chrome.js'
import {ContextSummary} from '../pane/context-tracker.js'
import {QueueStrip} from '../pane/queue-strip.js'
import {StatusBar, type StatusBarView} from '../pane/status-bar.js'
import {makeRefreshCoordinator} from '../pane/refresh-coordinator.js'
import {SessionPillPending, UsagePending} from '../shell/pending.js'
import {guardedComponent} from '../extension/extension-boundary.js'
import {collectViews} from '../extension/extension-views.js'
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
  'flex items-center gap-1.5 min-w-0 p-0 bg-transparent [border:none] text-start cursor-pointer rounded-[var(--chat-radius-sm)] focus-ring aria-busy:cursor-progress'
const RAIL_TITLE_RENAME =
  'size-7 shrink-0 [&[hidden]]:hidden invisible opacity-0 [transition:opacity_120ms_var(--chat-ease),visibility_120ms_var(--chat-ease)] motion-reduce:[transition:none] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 [@media(hover:none)]:visible [@media(hover:none)]:opacity-100'
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

const POP_OUT_LOST_KEY = 'pop-out-lost'

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
  const matchRoute = useMatchRoute()
  const viewMatch = matchRoute({to: '/panel/$sessionId/$view'})
  const search = Route.useSearch()
  const notices = useNotices()
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
  createEffect(
    on(
      () => search().popOut,
      (popOutState) => {
        if (popOutState !== 'lost') {
          notices.remove(POP_OUT_LOST_KEY)
          return
        }
        notices.notify('The pop-out window could not be reopened.', {
          key: POP_OUT_LOST_KEY,
          action: {label: 'Pop out again', run: popOut},
        })
      },
    ),
  )

  const chat = usePaneChat(() => params().sessionId)
  const session = useQuery(() => appData.utils.sessions.get.queryOptions({input: {sessionId: params().sessionId}}))
  const row = () => (session.isPending ? undefined : session.data)
  const usage = () => row()?.usage ?? null
  const running = () => row()?.running ?? chat().runInProgress()

  const views = createMemo(() => collectViews(instances))
  const activeView = () => {
    const match = viewMatch()
    return match ? match.view : 'chat'
  }
  const [viewLocks, setViewLocks] = createSignal<Record<string, boolean>>({})
  const setLockedFor = (id: string) => (locked: boolean) => setViewLocks((prev) => ({...prev, [id]: locked}))
  const viewLocked = () => activeView() !== 'chat' && Boolean(viewLocks()[activeView()])

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
  const queue = createMemo(() => chat().queue())
  const sessionStatus = createSessionStatus(() => ({
    latestRollup: latestRollup(),
    isStreaming: isStreaming(),
    queueLength: queue().length,
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
  const rename = useMutation(() => ({
    mutationFn: (input: {sessionId: string; title: string}) => rpc.sessions.rename(input),
    onSuccess: (result: {title: string}) => announce(`Renamed to ${result.title}`),
    onError: () => announce('Rename failed', true),
    onSettled: () => appData.invalidateSessions(),
  }))
  const taskTitle = () =>
    rename.isPending && rename.variables ? rename.variables.title : row()?.title || 'New session'
  const commitTitle = (value: string) => {
    const title = value.trim()
    if (!title || title === taskTitle()) return
    rename.mutate({sessionId: params().sessionId, title})
  }
  const [menuOpen, setMenuOpen] = createSignal(false)
  let menuContent: HTMLDivElement | undefined
  let menuTrigger: HTMLButtonElement | undefined
  const changeMenu = (open: boolean) => {
    if (!open && menuContent?.matches(':focus-within')) menuTrigger?.focus()
    setMenuOpen(open)
  }
  const titleMenuLabel = () =>
    `${taskTitle()}, ${coordinator.isRefreshing() ? 'refreshing the conversation' : 'session options'}`
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
        <HoverCard.Root open={menuOpen()} onOpenChange={(details) => changeMenu(details.open)}>
          <div class={RAIL_LEFT}>
            <span class={RAIL_MICROLABEL}>
              <span class="chat-rail-context-full">
                CONCIV <span class={RAIL_SEPARATOR}>/</span> {taskContext()}
              </span>
              <span class="chat-rail-context-narrow">{lastTask() ? 'LAST' : 'ACTIVE'}</span>
            </span>
            <Editable.Root
              class={RAIL_TITLE_ROW}
              activationMode="none"
              translations={{edit: 'Rename session', input: 'Session title'}}
              onValueCommit={(details) => commitTitle(details.value)}
            >
              <Editable.Context>
                {(titleEditor) => (
                  <>
                    <Editable.Area class={titleEditor().editing ? 'flex-1' : undefined}>
                      <Editable.Input />
                      <Show when={!titleEditor().editing}>
                        <HoverCard.Trigger
                          asChild={(triggerProps) => (
                            <button
                              {...triggerProps()}
                              ref={(element) => (menuTrigger = element)}
                              type="button"
                              class={RAIL_TITLE_TRIGGER}
                              aria-label={titleMenuLabel()}
                              aria-haspopup="dialog"
                              aria-expanded={menuOpen()}
                              aria-busy={coordinator.isRefreshing() || rename.isPending}
                              onFocusIn={undefined}
                              onClick={() => changeMenu(true)}
                              onPointerLeave={(event) => {
                                const leave = triggerProps().onPointerLeave
                                if (menuEngaged(menuContent) || typeof leave !== 'function') return
                                leave(event)
                              }}
                              onFocusOut={(event) => {
                                const focusOut = triggerProps().onFocusOut
                                if (holds(menuContent, event.relatedTarget) || typeof focusOut !== 'function') return
                                focusOut(event)
                              }}
                            >
                              <TruncatedText class={RAIL_TITLE} text={taskTitle()} side="bottom" />
                              <Show when={coordinator.isRefreshing()}>
                                <RefreshCw
                                  class="size-3.5 block shrink-0 [color:var(--chat-text-2)] [transform-origin:center] anim-tool-spin"
                                  aria-hidden="true"
                                />
                              </Show>
                            </button>
                          )}
                        />
                      </Show>
                    </Editable.Area>
                    <TooltipIconButtonSlot tooltip="Rename session" class={RAIL_TITLE_RENAME} side="bottom">
                      {(buttonProps) => (
                        <Editable.EditTrigger
                          asChild={(triggerProps) => (
                            <button
                              {...buttonProps()}
                              {...triggerProps({onClick: () => titleEditor().setValue(taskTitle())})}
                            >
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
          </div>
          <HoverCard.Context>
            {(hoverCard) => {
              const cardOpen = createMemo(() => hoverCard().open)
              createEffect(
                on(cardOpen, (open) => {
                  if (open && menuTrigger?.matches(':focus'))
                    menuContent?.querySelector<HTMLElement>('button:enabled')?.focus({preventScroll: true})
                }),
              )
              return (
                <HoverCard.Positioner>
                  <HoverCard.Content
                    asChild={(contentProps) => (
                      <div
                        {...contentProps()}
                        ref={(element) => (menuContent = element)}
                        role="dialog"
                        aria-label="Session options"
                        class={`${contentProps().class ?? ''} ${RAIL_MENU_CONTENT}`}
                        style={RAIL_MENU_CONTENT_STYLE}
                        onPointerLeave={(event) => {
                          const leave = contentProps().onPointerLeave
                          if (menuEngaged(menuContent) || typeof leave !== 'function') return
                          leave(event)
                        }}
                        onFocusOut={(event) => {
                          if (holds(menuContent, event.relatedTarget) || holds(menuTrigger, event.relatedTarget)) return
                          if (menuContent?.matches(':hover')) return
                          changeMenu(false)
                        }}
                      >
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
                            aria-label="Refresh the conversation"
                            disabled={chat().runInProgress() || coordinator.isRefreshing()}
                            onClick={() => {
                              changeMenu(false)
                              coordinator.refresh()
                            }}
                          >
                            <RefreshCw class="size-4 block shrink-0" aria-hidden="true" />
                            Refresh the conversation
                          </button>
                        </Show>
                        <button type="button" class={RAIL_MENU_ROW} onClick={popOut}>
                          <PictureInPicture2 class="size-4 block shrink-0" aria-hidden="true" />
                          Pop out to a window
                        </button>
                        <Show when={connectMode && disconnect}>
                          <button type="button" class={RAIL_MENU_ROW} onClick={() => disconnect?.()}>
                            <Unplug class="size-4 block shrink-0" aria-hidden="true" />
                            Disconnect this machine
                          </button>
                        </Show>
                      </div>
                    )}
                  />
                </HoverCard.Positioner>
              )
            }}
          </HoverCard.Context>
        </HoverCard.Root>
        <CloseChatButton />
      </header>
      <ChatProvider chat={chat()}>
        <QueueStrip queue={queue()} />
      </ChatProvider>
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

function menuEngaged(content: HTMLElement | undefined): boolean {
  if (!content) return false
  return content.matches(':focus-within') || content.querySelector('[aria-expanded="true"]') !== null
}

function holds(container: HTMLElement | undefined, target: EventTarget | null): boolean {
  return container !== undefined && target instanceof Node && container.contains(target)
}
