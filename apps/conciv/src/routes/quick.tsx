import {createFileRoute, redirect, useRouter} from '@tanstack/solid-router'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {For, Show, Suspense, createEffect, onCleanup, onMount, type JSX} from 'solid-js'
import {Button, TooltipIconButton, createResizable} from '@conciv/ui-kit-system'
import ChevronUp from 'lucide-solid/icons/chevron-up'
import Columns2 from 'lucide-solid/icons/columns-2'
import PictureInPicture2 from 'lucide-solid/icons/picture-in-picture-2'
import X from 'lucide-solid/icons/x'
import {useAppData, useConnectionGeneration, useRpc, useSuppressed} from '../app/context.js'
import {useEngineReachability} from '../app/reachability.js'
import {PaneProvider} from '../app/pane-provider.js'
import {ChatPane} from '../pane/chat-pane.js'
import {RefreshButton} from '../shell/refresh-button.js'
import {ContextTracker} from '../pane/context-tracker.js'
import {SessionSelector} from '../composer/session-selector.js'
import {SessionPillPending, UsagePending} from '../shell/pending.js'
import {NoticeContextProvider, NoticeSurface} from '../shell/notice-context.js'
import {EngineStaleNotice, EngineUnreachableNotice} from '../shell/engine-notice.js'
import {QuickSearchSchema, quickPaneIds, quickSearchFor} from '../lib/quick-search.js'

const CLOSE =
  'bg-transparent [border:none] text-chat-text-2 text-[1.375rem] cursor-pointer inline-flex items-center justify-center size-9.5 rounded-chat-surface-sm trans-color-bg hover:text-chat-text hover:bg-chat-fill-strong'

const PANE_ACTION = 'text-chat-text-3 leading-none size-6'

const ADD_PANE_FAILED_MESSAGE = 'conciv could not start a pane. Check the engine connection and retry.'

export const Route = createFileRoute('/quick')({
  validateSearch: QuickSearchSchema,
  beforeLoad: ({context}) => {
    if (!context.settings.quickTerminal.enabled) throw redirect({to: '/'})
  },
  component: QuickLayer,
})

function qtShellClass(): string {
  return "text-sm text-chat-text leading-[1.45] font-normal font-chat border-b border-b-chat-line rounded-b-chat-surface-lg bg-chat-glass flex flex-col pointer-events-auto transition-transform duration-300 ease-chat-expo shadow-chat-lg left-0 right-0 top-0 fixed backdrop-blur-[20px] backdrop-saturate-[1.4] after:accent-sweep after:opacity-55 after:h-px after:content-[''] after:inset-x-0 after:absolute after:-bottom-px translate-y-0 starting:-translate-y-full"
}

function resetPaneFlex(row: HTMLDivElement | undefined): void {
  for (const el of row?.querySelectorAll<HTMLElement>('[data-pw-qt-pane]') ?? []) el.style.flex = ''
}

function onGutterDown(e: PointerEvent) {
  e.preventDefault()
  if (!(e.currentTarget instanceof HTMLElement)) return
  const gutter = e.currentTarget
  const prev = gutter.previousElementSibling
  const next = gutter.nextElementSibling
  if (!(prev instanceof HTMLElement) || !(next instanceof HTMLElement)) return
  const startX = e.clientX
  const prevW = prev.getBoundingClientRect().width
  const nextW = next.getBoundingClientRect().width
  const total = prevW + nextW
  const move = (ev: PointerEvent) => {
    const newPrev = Math.max(180, Math.min(total - 180, prevW + (ev.clientX - startX)))
    prev.style.flex = `0 0 ${newPrev}px`
    next.style.flex = '1 1 0'
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

export function QuickTerminalHeader(props: {onPip: () => void; onSplit: () => void; onClose: () => void}): JSX.Element {
  return (
    <header class="px-4.5 py-3 border-b border-b-chat-line-soft flex shrink-0 gap-3 items-center">
      <span class="tracking-[-0.01em] font-semibold flex gap-2 items-center">
        <span class="text-base text-chat-accent" aria-hidden="true">
          ✦
        </span>
        conciv
      </span>
      <span class="text-[0.6875rem] text-chat-text-3 leading-none tracking-[0.08em] font-medium font-chat-mono px-2.25 py-1 border border-chat-line-2 rounded-chat-pill uppercase">
        quick terminal
      </span>
      <span class="flex-1" />
      <TooltipIconButton tooltip="Pop out to a window" class={CLOSE} onClick={props.onPip}>
        <PictureInPicture2 class="size-5 block" aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton tooltip="Split pane (Mod+D)" class={CLOSE} onClick={props.onSplit}>
        <Columns2 class="size-5 block" aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton tooltip="Close quick terminal" class={CLOSE} onClick={props.onClose}>
        <ChevronUp class="size-[1em] block" aria-hidden="true" />
      </TooltipIconButton>
    </header>
  )
}

function QuickLayer(): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const suppressed = useSuppressed()
  const router = useRouter()
  const generation = useConnectionGeneration()
  const search = Route.useSearch()
  const paneIds = () => quickPaneIds(search())
  const focusedIndex = () => Math.min(search().focus, Math.max(0, paneIds().length - 1))

  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const usageOf = (id: string) => (sessions.data ?? []).find((session) => session.id === id)?.usage ?? null

  let rowEl: HTMLDivElement | undefined

  const reachability = useEngineReachability()

  const setSearch = (ids: string[], focus: number) =>
    void router.navigate({to: '/quick', search: quickSearchFor(ids, focus), replace: true})

  const addPane = useMutation(() => ({
    mutationFn: () => rpc.sessions.resolve({}),
    onSuccess: ({sessionId}) => {
      const ids = [...paneIds(), sessionId]
      setSearch(ids, ids.length - 1)
      appData.invalidateSessions()
      resetPaneFlex(rowEl)
    },
  }))

  const triggerAddPane = (): void => {
    if (addPane.isPending) return
    addPane.mutate()
  }

  let wasOnline = reachability.online()
  createEffect(() => {
    const isOnline = reachability.online()
    if (isOnline && !wasOnline && paneIds().length === 0) triggerAddPane()
    wasOnline = isOnline
  })

  const closePane = (index: number) => {
    const ids = paneIds()
    const closed = ids[index]
    if (closed) void rpc.sessions.delete({sessionId: closed}).catch(() => {})
    const remaining = ids.filter((_, i) => i !== index)
    appData.invalidateSessions()
    if (remaining.length === 0) {
      router.history.back()
      return
    }
    setSearch(remaining, Math.min(focusedIndex(), remaining.length - 1))
    resetPaneFlex(rowEl)
  }

  const focusPane = (index: number) => {
    if (index !== search().focus) setSearch(paneIds(), index)
  }

  const activatePane = (index: number, id: string) => {
    const ids = [...paneIds()]
    ids[index] = id
    setSearch(ids, index)
  }

  const resize = createResizable({
    initial: Math.round(window.innerHeight * 0.52),
    min: 200,
    collapseAt: 120,
    storageKey: 'conciv-qt-height',
    grow: () => 'down',
    onCollapse: () => router.history.back(),
  })

  createHotkey({key: 'D', mod: true}, () => triggerAddPane())

  let restoreFocus: HTMLElement | null = null
  onMount(() => {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (paneIds().length === 0) triggerAddPane()
  })
  onCleanup(() => restoreFocus?.focus())

  return (
    <NoticeContextProvider>
      <section
        class={qtShellClass()}
        data-pw-qt
        data-pw-suppressed={suppressed()}
        style={{height: `${resize.size()}px`}}
        role="dialog"
        aria-label="conciv quick terminal"
      >
        <NoticeSurface />
        <EngineStaleNotice />
        <EngineUnreachableNotice />
        <QuickTerminalHeader
          onPip={() => {
            const id = paneIds()[focusedIndex()]
            if (id) void router.navigate({to: '/pip/$sessionId', params: {sessionId: id}})
          }}
          onSplit={() => triggerAddPane()}
          onClose={() => router.history.back()}
        />
        <div
          class="flex flex-1 min-h-0 overflow-x-auto"
          ref={(el) => {
            rowEl = el
          }}
        >
          <Show
            when={paneIds().length > 0}
            fallback={
              <div
                class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-chat-text-2 text-[0.8125rem]"
                role="status"
              >
                <p>{addPane.isError ? ADD_PANE_FAILED_MESSAGE : 'Starting a pane…'}</p>
                <Show when={addPane.isError}>
                  <Button variant="outline-danger" onClick={triggerAddPane} disabled={addPane.isPending}>
                    Retry
                  </Button>
                </Show>
              </div>
            }
          >
            <For each={paneIds()}>
              {(id, index) => (
                <>
                  <Show when={index() > 0}>
                    <div
                      class="flex-[0_0_0.4375rem] cursor-col-resize relative before:bg-chat-line before:content-[''] before:transition-[background-color] before:duration-[120ms] before:ease-chat before:inset-x-[0.1875rem] before:inset-y-0 before:absolute hover:before:bg-chat-accent-line"
                      aria-hidden="true"
                      onPointerDown={onGutterDown}
                    />
                  </Show>
                  <PaneProvider sessionId={id} onNewSession={triggerAddPane}>
                    <div
                      data-pw-qt-pane
                      class={`flex flex-1 flex-col min-h-0 min-w-55 transition-opacity duration-[160ms] ease-chat relative ${focusedIndex() === index() ? "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-chat-accent before:opacity-90" : 'opacity-[0.62]'}`}
                      onPointerDown={() => focusPane(index())}
                      onFocusIn={() => {
                        if (focusedIndex() !== index()) focusPane(index())
                      }}
                    >
                      <div class="text-xs text-chat-text-3 leading-none font-chat-mono px-3 py-2 border-b border-b-chat-line-soft flex shrink-0 gap-2 items-center">
                        <Suspense fallback={<SessionPillPending variant="bar" />}>
                          <SessionSelector
                            variant="bar"
                            activeId={() => id}
                            onActivate={(next) => activatePane(index(), next)}
                            onNewSession={triggerAddPane}
                          />
                        </Suspense>
                        <Suspense fallback={<UsagePending />}>
                          <ContextTracker usage={usageOf(id)} />
                        </Suspense>
                        <span class="flex-1" />
                        <RefreshButton class={PANE_ACTION} />
                        <TooltipIconButton
                          tooltip="Close pane"
                          class={PANE_ACTION}
                          onClick={(e) => {
                            e.stopPropagation()
                            closePane(index())
                          }}
                        >
                          <X size={14} aria-hidden="true" />
                        </TooltipIconButton>
                      </div>
                      <Show when={{sessionId: id, generation: generation()}} keyed>
                        {(paneKey) => <ChatPane sessionId={paneKey.sessionId} />}
                      </Show>
                    </div>
                  </PaneProvider>
                </>
              )}
            </For>
          </Show>
        </div>
        <div
          class="rounded-full bg-chat-line-2 h-2 w-11.5 cursor-ns-resize bottom-[0.3125rem] left-1/2 absolute z-[2] focus-visible:outline-none focus-visible:bg-chat-accent hover:bg-chat-text-3 -translate-x-1/2"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize quick terminal height"
          aria-valuemin={200}
          aria-valuenow={Math.round(resize.size())}
          tabindex={0}
          onPointerDown={resize.onPointerDown}
          onKeyDown={resize.onKeyDown}
        />
      </section>
    </NoticeContextProvider>
  )
}
