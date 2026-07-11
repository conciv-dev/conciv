import {createFileRoute, redirect, useRouter} from '@tanstack/solid-router'
import {useQuery} from '@tanstack/solid-query'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {For, Show, onCleanup, onMount, type JSX} from 'solid-js'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {ChevronUp, Columns2, PictureInPicture2, X} from 'lucide-solid'
import {useApp} from '../app/context.js'
import {PaneProvider} from '../app/pane-provider.js'
import {ChatPane} from '../chat/chat-pane.js'
import {ContextTracker} from '../chat/context-tracker.js'
import {SessionSelector} from '../composer/session-selector.js'
import {createResizable} from '../lib/resize.js'
import {QuickSearchSchema, quickPaneIds, quickSearchFor} from '../lib/quick-search.js'

const CLOSE =
  'bg-transparent [border:none] text-pw-text-2 text-[1.375rem] cursor-pointer inline-flex items-center justify-center size-9.5 rounded-[0.5625rem] trans-color-bg hover:text-pw-text hover:bg-pw-fill-strong'

export const Route = createFileRoute('/quick')({
  validateSearch: (search) => QuickSearchSchema.parse(search),
  beforeLoad: ({context}) => {
    if (!context.settings.quickTerminal.enabled) throw redirect({to: '/'})
  },
  component: QuickLayer,
})

function qtShellClass(): string {
  return "text-sm text-pw-text leading-[1.45] font-normal font-pw will-change-transform border-b border-b-pw-line rounded-b-pw-lg bg-pw-glass flex flex-col pointer-events-auto transition-transform duration-300 ease-pw-expo shadow-pw-lg left-0 right-0 top-0 fixed backdrop-blur-[20px] backdrop-saturate-[1.4] after:accent-sweep after:opacity-55 after:h-px after:content-[''] after:inset-x-0 after:absolute after:-bottom-px translate-y-0"
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

function QuickTerminalHeader(props: {onPip: () => void; onSplit: () => void; onClose: () => void}): JSX.Element {
  return (
    <header class="px-4.5 py-3 border-b border-b-pw-line-soft flex shrink-0 gap-3 items-center">
      <span class="tracking-[-0.01em] font-semibold flex gap-2 items-center">
        <span class="text-base text-pw-accent" aria-hidden="true">
          ✦
        </span>
        conciv
      </span>
      <span class="text-[0.6875rem] text-pw-text-3 leading-none tracking-[0.08em] font-medium font-pw-mono px-2.25 py-1 border border-pw-line-2 rounded-pw-pill uppercase">
        quick terminal
      </span>
      <span class="flex-1" />
      <button
        type="button"
        class={CLOSE}
        aria-label="Pop out to a window"
        title="Picture-in-Picture"
        onClick={props.onPip}
      >
        <PictureInPicture2 class="size-5 block" aria-hidden="true" />
      </button>
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
  const app = useApp()
  const router = useRouter()
  const search = Route.useSearch()
  const paneIds = () => quickPaneIds(search())
  const focusedIndex = () => Math.min(search().focus, Math.max(0, paneIds().length - 1))

  const sessions = useQuery(() => app.data.utils.sessions.list.queryOptions())
  const usageOf = (id: string) => (sessions.data ?? []).find((session) => session.id === id)?.usage ?? null

  let rowEl: HTMLDivElement | undefined

  const setSearch = (ids: string[], focus: number) =>
    void router.navigate({to: '/quick', search: quickSearchFor(ids, focus), replace: true})

  const addPane = async () => {
    const {sessionId} = await app.rpc.sessions.resolve({})
    const ids = [...paneIds(), sessionId]
    setSearch(ids, ids.length - 1)
    app.data.invalidateSessions()
    resetPaneFlex(rowEl)
  }

  const closePane = (index: number) => {
    const ids = paneIds()
    const closed = ids[index]
    if (closed) void app.rpc.sessions.remove({sessionId: closed}).catch(() => {})
    const remaining = ids.filter((_, i) => i !== index)
    app.data.invalidateSessions()
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

  createHotkey({key: 'D', mod: true}, () => void addPane())

  let restoreFocus: HTMLElement | null = null
  onMount(() => {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (paneIds().length === 0) void addPane()
  })
  onCleanup(() => restoreFocus?.focus())

  return (
    <section
      class={qtShellClass()}
      data-pw-qt
      data-pw-suppressed={app.suppressed()}
      style={{height: `${resize.size()}px`}}
      role="dialog"
      aria-label="conciv quick terminal"
    >
      <QuickTerminalHeader
        onPip={() => {
          const id = paneIds()[focusedIndex()]
          if (id) void router.navigate({to: '/pip/$sessionId', params: {sessionId: id}})
        }}
        onSplit={() => void addPane()}
        onClose={() => router.history.back()}
      />
      <div
        class="flex flex-1 min-h-0 overflow-x-auto"
        ref={(el) => {
          rowEl = el
        }}
      >
        <For each={paneIds()}>
          {(id, index) => (
            <>
              <Show when={index() > 0}>
                <div
                  class="flex-[0_0_0.4375rem] cursor-col-resize relative before:bg-pw-line before:content-[''] before:transition-[background-color] before:duration-[120ms] before:ease-pw before:inset-x-[0.1875rem] before:inset-y-0 before:absolute hover:before:bg-pw-accent-line"
                  aria-hidden="true"
                  onPointerDown={onGutterDown}
                />
              </Show>
              <div
                data-pw-qt-pane
                class={`flex flex-1 flex-col min-h-0 min-w-55 transition-opacity duration-[160ms] ease-pw relative ${focusedIndex() === index() ? "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-pw-accent before:opacity-90" : 'opacity-[0.62]'}`}
                onPointerDown={() => focusPane(index())}
                onFocusIn={() => {
                  if (focusedIndex() !== index()) focusPane(index())
                }}
              >
                <div class="text-xs text-pw-text-3 leading-none font-pw-mono px-3 py-2 border-b border-b-pw-line-soft flex shrink-0 gap-2 items-center">
                  <SessionSelector
                    variant="bar"
                    activeId={() => id}
                    onActivate={(next) => activatePane(index(), next)}
                    onNewSession={() => void addPane()}
                  />
                  <ContextTracker usage={usageOf(id)} />
                  <button
                    type="button"
                    class="text-pw-text-3 leading-none ml-auto rounded-md inline-flex size-6 cursor-pointer transition-[color,background-color] duration-[120ms] ease-pw items-center justify-center hover:text-pw-text hover:bg-pw-fill-strong"
                    aria-label="Close pane"
                    onClick={(e) => {
                      e.stopPropagation()
                      closePane(index())
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <Show when={id} keyed>
                  {(sessionId) => (
                    <PaneProvider sessionId={sessionId}>
                      <ChatPane sessionId={sessionId} />
                    </PaneProvider>
                  )}
                </Show>
              </div>
            </>
          )}
        </For>
      </div>
      <div
        class="rounded-full bg-pw-line-2 h-2 w-11.5 cursor-ns-resize bottom-[0.3125rem] left-1/2 absolute z-[2] focus-visible:outline-none focus-visible:bg-pw-accent hover:bg-pw-text-3 -translate-x-1/2"
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
  )
}
