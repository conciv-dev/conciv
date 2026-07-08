import {createEffect, For, Show, type JSX} from 'solid-js'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {CLOSE, type ComposerActionDef, type ComposerControlDef, type PanelDef} from './shell-contract.js'
import type {PendingApproval} from './approval-modal.js'
import {createResizable} from '../lib/resize.js'
import {createPiP} from './pip.js'
import {ChevronUp, Columns2, PictureInPicture2, X} from 'lucide-solid'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {suppressedAttr} from './suppression.js'
import {escapeInTerminal} from './terminal-focus.js'
import {ContextTracker} from '../page/context-tracker.js'
import {SessionSelector} from '../composer/session-selector.js'
import {sessions} from '../client/session-store-client.js'
import {createQuickPanes, type QuickPane} from './quick-panes.js'

type Bindable = Parameters<typeof createHotkey>[0]

function qtShellClass(open: boolean): string {
  return `text-sm text-pw-text leading-[1.45] font-normal font-pw will-change-transform border-b border-b-pw-line rounded-b-pw-lg bg-pw-glass flex flex-col pointer-events-auto transition-transform duration-300 ease-pw-expo shadow-pw-lg left-0 right-0 top-0 fixed backdrop-blur-[20px] backdrop-saturate-[1.4] after:accent-sweep after:opacity-55 after:h-px after:content-[''] after:inset-x-0 after:absolute after:-bottom-px ${open ? 'translate-y-0' : '-translate-y-[101%]'}`
}

function resetPaneFlex(row: HTMLDivElement | undefined): void {
  for (const el of row?.querySelectorAll<HTMLElement>('[data-pw-qt-pane]') ?? []) el.style.flex = ''
}

function bindQuickTerminalHotkeys(opts: {
  hotkeys: string[]
  open: () => boolean
  setOpen: (v: boolean) => void
  addPane: () => void
  suppressEscape?: () => boolean
}): void {
  for (const binding of opts.hotkeys) {
    createHotkey(binding as Bindable, () => opts.setOpen(!opts.open()))
  }
  createHotkey(
    'Escape',
    () => {
      if (opts.suppressEscape?.()) return
      opts.setOpen(false)
    },
    () => ({enabled: opts.open()}),
  )
  createHotkey(
    'Mod+d' as Bindable,
    () => opts.addPane(),
    () => ({enabled: opts.open()}),
  )
}

function onGutterDown(e: PointerEvent) {
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

function QuickTerminalHeader(props: {
  title: string
  onPip: () => void
  onSplit: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <header class="px-4.5 py-3 border-b border-b-pw-line-soft flex shrink-0 gap-3 items-center">
      <span class="tracking-[-0.01em] font-semibold flex gap-2 items-center">
        <span class="text-base text-pw-accent" aria-hidden="true">
          ✦
        </span>
        {props.title}
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

function QuickTerminalPane(props: {
  pane: QuickPane
  index: () => number
  focused: () => boolean
  apiBase: string
  announce: (msg: string, assertive?: boolean) => void
  onFocus: () => void
  onClose: () => void
  onGutterDown: (e: PointerEvent) => void
}): JSX.Element {
  return (
    <>
      <Show when={props.index() > 0}>
        <div
          class="flex-[0_0_0.4375rem] cursor-col-resize relative before:bg-pw-line before:content-[''] before:transition-[background-color] before:duration-[120ms] before:ease-pw before:inset-x-[0.1875rem] before:inset-y-0 before:absolute hover:before:bg-pw-accent-line"
          aria-hidden="true"
          onPointerDown={props.onGutterDown}
        />
      </Show>
      <div
        data-pw-qt-pane
        class={`flex flex-1 flex-col min-h-0 min-w-55 transition-opacity duration-[160ms] ease-pw relative ${props.focused() ? "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-pw-accent before:opacity-90" : 'opacity-[0.62]'}`}
        onPointerDown={props.onFocus}
        onFocusIn={() => {
          if (!props.focused()) props.onFocus()
        }}
      >
        <div class="text-xs text-pw-text-3 leading-none font-pw-mono px-3 py-2 border-b border-b-pw-line-soft flex shrink-0 gap-2 items-center">
          <SessionSelector
            variant="bar"
            apiBase={props.apiBase}
            activeId={() => props.pane.client.sessionId()}
            onActivate={(id) => props.pane.client.setSessionId(id)}
            lockedElsewhere={(id) =>
              (sessions().find((s) => s.id === id)?.running ?? false) && id !== props.pane.client.sessionId()
            }
            announce={props.announce}
          />
          <ContextTracker usage={props.pane.usage()} />
          <button
            type="button"
            class="text-pw-text-3 leading-none ml-auto rounded-md inline-flex size-6 cursor-pointer transition-[color,background-color] duration-[120ms] ease-pw items-center justify-center hover:text-pw-text hover:bg-pw-fill-strong"
            aria-label="Close pane"
            onClick={(e) => {
              e.stopPropagation()
              props.onClose()
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {props.pane.content}
      </div>
    </>
  )
}

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
  let rowEl: HTMLDivElement | undefined
  let sectionEl: HTMLElement | undefined

  const store = createQuickPanes({
    panel: props.panel,
    open: props.open,
    setOpen: props.setOpen,
    reportApprovals: props.reportApprovals,
    announce: props.announce,
    composerActions: props.composerActions,
    composerControls: props.composerControls,
    onReflow: () => resetPaneFlex(rowEl),
  })

  createEffect(() => {
    if (sectionEl) sectionEl.inert = !props.open()
  })

  bindQuickTerminalHotkeys({
    hotkeys: props.hotkeys,
    open: props.open,
    setOpen: props.setOpen,
    addPane: store.addPane,
    suppressEscape: () => escapeInTerminal(sectionEl),
  })

  return (
    <section
      ref={(el) => {
        sectionEl = el
      }}
      class={qtShellClass(props.open())}
      data-pw-qt
      data-pw-suppressed={suppressedAttr()}
      style={{height: `${resize.size()}px`}}
      role="dialog"
      aria-label="conciv quick terminal"
      aria-hidden={!props.open()}
    >
      <QuickTerminalHeader
        title={props.panel.title}
        onPip={() => sectionEl && pip.open(sectionEl, {title: 'conciv quick terminal'})}
        onSplit={() => store.addPane()}
        onClose={() => props.setOpen(false)}
      />
      <div
        class="flex flex-1 min-h-0 overflow-x-auto"
        ref={(el) => {
          rowEl = el
        }}
      >
        <For each={store.panes()}>
          {(pane, i) => (
            <QuickTerminalPane
              pane={pane}
              index={i}
              focused={() => store.focused() === pane.id}
              apiBase={store.apiBase}
              announce={props.announce}
              onFocus={() => store.focusPane(pane.id)}
              onClose={() => store.closePane(pane.id)}
              onGutterDown={onGutterDown}
            />
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
