import {
  createEffect,
  createRoot,
  createSignal,
  createUniqueId,
  For,
  getOwner,
  onCleanup,
  Show,
  type JSX,
} from 'solid-js'
import {EnvironmentProvider} from '@conciv/ui-kit-system'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {CLOSE, type ComposerActionDef, type ComposerControlDef, type PanelDef} from './widget-shell.js'
import type {PendingApproval} from './approval-modal.js'
import {createResizable} from '../lib/resize.js'
import {readStorage, writeStorage} from '../lib/persisted-signal.js'
import {createPiP} from './pip.js'
import {ChevronUp, Columns2, PictureInPicture2, X} from 'lucide-solid'
import {picking} from '../page/react-grab/picking.js'
import {anyOpen} from './dialogs.js'
import {ContextTracker} from '../page/context-tracker.js'
import {SessionSelector} from '../composer/session-selector.js'
import {sessions, mergeSurface, makeSurfaceRow, invalidateSessions} from '../client/session-store-client.js'
import {defineClient, type SessionClient} from '@conciv/api-client'
import {SessionId, isSessionId} from '@conciv/protocol/chat-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'

type Pane = {
  id: number
  client: SessionClient
  content: JSX.Element
  dispose: () => void
  usage: () => UsageSnapshot | null
  working: () => boolean
}

type Bindable = Parameters<typeof createHotkey>[0]

export function QuickTerminalLayout(props: {
  panel: PanelDef
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
  hotkeys: string[]
  announce: (msg: string, assertive?: boolean) => void
  reportApprovals: (key: string, approvals: PendingApproval[]) => void
  open: () => boolean
  setOpen: (v: boolean) => void
}): JSX.Element {
  const resize = createResizable({
    initial: Math.round(window.innerHeight * 0.52),
    min: 200,
    collapseAt: 120,
    storageKey: 'conciv-qt-height',
    grow: () => 'down',
    onCollapse: () => props.setOpen(false),
  })

  const pip = createPiP()
  const [panes, setPanes] = createSignal<Pane[]>([])
  const [focused, setFocused] = createSignal(0)
  let seq = 0
  let rowEl: HTMLDivElement | undefined
  let sectionEl: HTMLElement | undefined

  const PANES_KEY = 'conciv-qt-panes'
  const readPaneIds = (): string[] =>
    readStorage(
      PANES_KEY,
      (raw) => {
        const arr: unknown = JSON.parse(raw)
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : undefined
      },
      [],
    )
  const writePaneIds = (ids: (string | null)[]) =>
    writeStorage(
      PANES_KEY,
      ids.filter((x): x is string => Boolean(x)),
      JSON.stringify,
    )

  const paneIds = (): (string | null)[] => panes().map((p) => p.client.sessionId())

  const forgetSession = (client: SessionClient) => {
    if (client.sessionId()) void client.remove().catch(() => {})
  }

  const FOCUS_KEY = 'conciv-qt-focused'
  const readFocusIndex = (): number =>
    readStorage(
      FOCUS_KEY,
      (raw) => {
        const n = Number(raw)
        return Number.isInteger(n) && n >= 0 ? n : undefined
      },
      0,
    )
  const focusPane = (id: number) => {
    setFocused(id)
    const idx = panes().findIndex((p) => p.id === id)
    if (idx >= 0) {
      writeStorage(FOCUS_KEY, idx)
    }
  }

  const owner = getOwner()

  const addPane = (initialId?: string) => {
    const id = ++seq
    const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
    const [working, setWorking] = createSignal(false)

    const client = defineClient({apiBase: props.panel.apiBase ?? ''})
    if (initialId && isSessionId(initialId)) client.setSessionId(SessionId.parse(initialId))
    else void client.resolve().then((r) => client.setSessionId(r.sessionId))

    const approvalKey = createUniqueId()
    const [content, dispose] = createRoot(
      (disposePane) =>
        [
          <EnvironmentProvider value={() => sectionEl?.getRootNode() ?? document}>
            {props.panel.create({
              active: () => props.open() && focused() === id,
              onWorkingChange: setWorking,
              onUsageChange: setUsage,
              onApprovalsChange: (items) => props.reportApprovals(approvalKey, items),

              onSessionLabel: (name) => {
                const sid = client.sessionId()
                mergeSurface(sid, sid ? makeSurfaceRow(sid, name) : null)
              },
              client,
              announce: props.announce,
              composerActions: props.composerActions,
              composerControls: props.composerControls,
            })}
          </EnvironmentProvider>,
          disposePane,
        ] as const,
      owner,
    )
    setPanes((ps) => [...ps, {id, client, content, dispose, usage, working}])
    writePaneIds(paneIds())
    void invalidateSessions(props.panel.apiBase ?? '')
    focusPane(id)
  }

  const closePane = (id: number) => {
    const target = panes().find((p) => p.id === id)
    const remaining = panes().filter((p) => p.id !== id)
    if (target) forgetSession(target.client)
    writePaneIds(remaining.map((p) => p.client.sessionId()))
    void invalidateSessions(props.panel.apiBase ?? '')
    if (remaining.length === 0) {
      props.setOpen(false)
      return
    }
    const refocus = focused() === id
    setPanes(remaining)
    target?.dispose()
    if (refocus) focusPane(remaining[remaining.length - 1]!.id)

    if (rowEl) for (const el of rowEl.querySelectorAll<HTMLElement>('[data-pw-qt-pane]')) el.style.flex = ''
  }

  onCleanup(() => {
    for (const pane of panes()) pane.dispose()
  })

  createEffect(() => {
    if (sectionEl) sectionEl.inert = !props.open()
  })

  const savedIds = readPaneIds()
  if (savedIds.length > 0) for (const sid of savedIds) addPane(sid)
  else addPane()

  let wasOpen = false
  let restoreFocus: HTMLElement | null = null
  createEffect(() => {
    const open = props.open()
    if (open && !wasOpen) {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const target = panes()[Math.min(readFocusIndex(), panes().length - 1)]
      if (target) setFocused(target.id)
    } else if (!open && wasOpen) {
      restoreFocus?.focus()
      restoreFocus = null
    }
    wasOpen = open
  })

  for (const binding of props.hotkeys) {
    createHotkey(binding as Bindable, () => props.setOpen(!props.open()))
  }
  createHotkey(
    'Escape',
    () => props.setOpen(false),
    () => ({enabled: props.open()}),
  )
  createHotkey(
    'Mod+d' as Bindable,
    () => addPane(),
    () => ({enabled: props.open()}),
  )

  const onGutterDown = (e: PointerEvent) => {
    e.preventDefault()
    const gutter = e.currentTarget as HTMLElement
    const prev = gutter.previousElementSibling as HTMLElement | null
    const next = gutter.nextElementSibling as HTMLElement | null
    if (!prev || !next) return
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

  return (
    <section
      ref={(el) => {
        sectionEl = el
      }}
      class={`text-sm text-pw-text leading-[1.45] font-normal font-pw will-change-transform border-b border-b-pw-line rounded-b-pw-lg bg-pw-glass flex flex-col pointer-events-auto transition-transform duration-300 ease-pw-expo shadow-pw-lg left-0 right-0 top-0 fixed backdrop-blur-[20px] backdrop-saturate-[1.4] after:accent-sweep after:opacity-55 after:h-px after:content-[''] after:inset-x-0 after:absolute after:-bottom-px ${props.open() ? 'translate-y-0' : '-translate-y-[101%]'}`}
      data-pw-qt
      data-pw-suppressed={picking() || anyOpen() ? '' : undefined}
      style={{height: `${resize.size()}px`}}
      role="dialog"
      aria-label="conciv quick terminal"
      aria-hidden={!props.open()}
    >
      <EnvironmentProvider value={() => sectionEl?.getRootNode() ?? document}>
        <header class="px-4.5 py-3 border-b border-b-pw-line-soft flex shrink-0 gap-3 items-center">
          <span class="tracking-[-0.01em] font-semibold flex gap-2 items-center">
            <span class="text-base text-pw-accent" aria-hidden="true">
              ✦
            </span>
            {props.panel.title}
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
            onClick={() => sectionEl && pip.open(sectionEl, {title: 'conciv quick terminal'})}
          >
            <PictureInPicture2 class="size-5 block" aria-hidden="true" />
          </button>
          <button
            type="button"
            class={CLOSE}
            aria-label="Split pane"
            title="Split pane (Mod+D)"
            onClick={() => addPane()}
          >
            <Columns2 class="size-5 block" aria-hidden="true" />
          </button>
          <button type="button" class={CLOSE} aria-label="Close quick terminal" onClick={() => props.setOpen(false)}>
            <ChevronUp class="size-[1em] block" aria-hidden="true" />
          </button>
        </header>
        <div
          class="flex flex-1 min-h-0 overflow-x-auto"
          ref={(el) => {
            rowEl = el
          }}
        >
          <For each={panes()}>
            {(pane, i) => (
              <>
                <Show when={i() > 0}>
                  <div
                    class="flex-[0_0_0.4375rem] cursor-col-resize relative before:bg-pw-line before:content-[''] before:transition-[background-color] before:duration-[120ms] before:ease-pw before:inset-x-[0.1875rem] before:inset-y-0 before:absolute hover:before:bg-pw-accent-line"
                    aria-hidden="true"
                    onPointerDown={onGutterDown}
                  />
                </Show>
                <div
                  data-pw-qt-pane
                  class={`flex flex-1 flex-col min-h-0 min-w-55 transition-opacity duration-[160ms] ease-pw relative ${focused() === pane.id ? "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-pw-accent before:opacity-90" : 'opacity-[0.62]'}`}
                  onPointerDown={() => focusPane(pane.id)}
                  onFocusIn={() => {
                    if (focused() !== pane.id) focusPane(pane.id)
                  }}
                >
                  <div class="text-xs text-pw-text-3 leading-none font-pw-mono px-3 py-2 border-b border-b-pw-line-soft flex shrink-0 gap-2 items-center">
                    <SessionSelector
                      variant="bar"
                      apiBase={props.panel.apiBase ?? ''}
                      activeId={() => pane.client.sessionId()}
                      onActivate={(id) => pane.client.setSessionId(id)}
                      lockedElsewhere={(id) =>
                        (sessions().find((s) => s.id === id)?.running ?? false) && id !== pane.client.sessionId()
                      }
                      announce={props.announce}
                    />
                    <ContextTracker usage={pane.usage()} />
                    <button
                      type="button"
                      class="text-pw-text-3 leading-none ml-auto rounded-md inline-flex size-6 cursor-pointer transition-[color,background-color] duration-[120ms] ease-pw items-center justify-center hover:text-pw-text hover:bg-pw-fill-strong"
                      aria-label="Close pane"
                      onClick={(e) => {
                        e.stopPropagation()
                        closePane(pane.id)
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {pane.content}
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
      </EnvironmentProvider>
    </section>
  )
}
