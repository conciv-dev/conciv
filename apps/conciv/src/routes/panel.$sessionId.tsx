import {Outlet, createFileRoute, redirect, useMatchRoute, useRouter} from '@tanstack/solid-router'
import {useQuery} from '@tanstack/solid-query'
import {Tabs, TooltipIconButton} from '@conciv/ui-kit-system'
import {ChevronDown, PictureInPicture2, Unplug} from 'lucide-solid'
import {For, Show, createEffect, createMemo, createSignal, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Grab} from '@conciv/grab'
import {isSessionId} from '@conciv/protocol/chat-types'
import {useAnnounce, useAppData, useDisconnect, useInstances, useRpc} from '../app/context.js'
import {PaneContext, type PaneContextValue, type StagedGrab} from '../app/pane-context.js'
import {SessionSelector} from '../composer/session-selector.js'
import {setShutter} from '../lib/shutter.js'
import {ContextTracker} from '../chat/context-tracker.js'
import {collectViews} from '../extension/extension-views.js'

const HEAD = 'flex items-center gap-2.5 py-3 px-3.5 border-b border-b-pw-line-soft'
const CLOSE =
  'bg-transparent [border:none] text-pw-text-2 text-[1.375rem] cursor-pointer inline-flex items-center justify-center size-9.5 rounded-[0.5625rem] trans-color-bg hover:text-pw-text hover:bg-pw-fill-strong'

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
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const instances = useInstances()
  const {connectMode, disconnect} = useDisconnect()
  const router = useRouter()
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

  const [hydrating, setHydrating] = createSignal(true)
  createEffect(() => {
    params().sessionId
    activeView()
    setHydrating(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setHydrating(false)))
  })

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

  const [grabs, setGrabs] = createSignal<StagedGrab[]>([])
  const grabStore = {
    grabs,
    stage: (grab: Grab) => setGrabs((prev) => [...prev, grab]),
    stageTexts: (texts: string[]) => setGrabs(texts.map((text) => ({text}))),
    remove: (grab: StagedGrab) => setGrabs((prev) => prev.filter((entry) => entry !== grab)),
    clear: () => setGrabs([]),
  }

  const paneValue: PaneContextValue = {
    sessionId: () => params().sessionId,
    running,
    viewLocked,
    setLockedFor,
    slideClass,
    hydrating,
    resetSlide: () => setSlideDir(null),
    grabStore,
  }

  return (
    <PaneContext.Provider value={paneValue}>
      <header class={HEAD}>
        <TooltipIconButton
          tooltip="Pop out to a window"
          class={CLOSE}
          onClick={() => void router.navigate({to: '/pip/$sessionId', params: {sessionId: params().sessionId}})}
        >
          <PictureInPicture2 class="size-5 block" aria-hidden="true" />
        </TooltipIconButton>
        <span class="tracking-[-0.01em] font-semibold">conciv</span>
        <SessionSelector
          variant="pill"
          activeId={() => params().sessionId}
          onActivate={activate}
          onNewSession={() => void newSession()}
        />
        <ContextTracker usage={usage()} />
        <Show when={connectMode && disconnect}>
          <TooltipIconButton
            tooltip="Disconnect this machine"
            class={`${CLOSE} ml-auto`}
            onClick={() => disconnect?.()}
          >
            <Unplug class="size-[1em] block" aria-hidden="true" />
          </TooltipIconButton>
        </Show>
        <TooltipIconButton
          tooltip="Close chat"
          class={`${CLOSE}${connectMode && disconnect ? '' : ' ml-auto'}`}
          onClick={() => setShutter(router, false)}
        >
          <ChevronDown class="size-[1em] block" aria-hidden="true" />
        </TooltipIconButton>
      </header>
      <Show when={views().length > 0}>
        <div class="px-2.5 flex gap-2 items-center">
          <Tabs.Root value={activeView()} onValueChange={(details) => switchView(details.value)} class="flex-1 min-w-0">
            <Tabs.List>
              <Tabs.Trigger value="chat" disabled={leaveGuard()}>
                Chat
              </Tabs.Trigger>
              <For each={views()}>
                {(view) => (
                  <Tabs.Trigger value={view.id} disabled={leaveGuard()}>
                    <Show when={view.icon}>{(icon) => <Dynamic component={icon()} class="size-3.5" />}</Show>
                    {view.label}
                  </Tabs.Trigger>
                )}
              </For>
              <Tabs.Indicator />
            </Tabs.List>
          </Tabs.Root>
        </div>
      </Show>
      <Outlet />
    </PaneContext.Provider>
  )
}
