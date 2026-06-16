import {createEffect, createSignal, For, Show, type JSX} from 'solid-js'
import {createHotkey} from '@tanstack/solid-hotkeys'
import type {ComposerActionDef, ComposerControlDef, PanelDef} from './widget-shell.js'
import {createResizable} from './resize.js'
import {readStorage, writeStorage} from './persisted-signal.js'
import {createPiP} from './pip.js'
import {ChevronUp, Columns2, PictureInPicture2, X} from 'lucide-solid'
import {picking} from './react-grab/picking.js'
import {ContextTracker} from './context-tracker.js'
import {SessionSelector} from './session-selector.js'
import {sessions, mergeSurface, makeSurfaceRow, invalidateSessions} from './session-store-client.js'
import {defineClient, type SessionClient} from './session-client.js'
import {SessionId, isSessionId} from '@aidx/protocol/chat-types'
import type {UsageSnapshot} from '@aidx/protocol/usage-types'

type Pane = {
  id: number
  client: SessionClient
  content: JSX.Element
  usage: () => UsageSnapshot | null
  working: () => boolean
}

// Bindings come from user config as plain strings; the library wants its template-literal hotkey
// type. They're validated at runtime by the key matcher, so a cast is the right call here.
type Bindable = Parameters<typeof createHotkey>[0]

// Quick-terminal layout: a full-width sheet that drops from the top edge on a hotkey (iTerm2 /
// Ghostty style), no page-dimming scrim, draggable height (shared resize primitive). It splits into
// a horizontal row of panes; each pane is an independent agent session (its own ChatPanel). Closing
// a pane reflows survivors; closing the last closes the sheet.
export function QuickTerminalLayout(props: {
  panel: PanelDef
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
  hotkeys: string[]
  announce: (msg: string, assertive?: boolean) => void
  open: () => boolean
  setOpen: (v: boolean) => void
}): JSX.Element {
  const resize = createResizable({
    initial: Math.round(window.innerHeight * 0.52),
    min: 200,
    collapseAt: 120,
    storageKey: 'aidx-qt-height',
    grow: () => 'down',
    onCollapse: () => props.setOpen(false),
  })

  const pip = createPiP()
  const [panes, setPanes] = createSignal<Pane[]>([])
  const [focused, setFocused] = createSignal(0)
  let seq = 0
  let rowEl: HTMLDivElement | undefined
  let sectionEl: HTMLElement | undefined

  // Persisted pane layout: one session id per pane, restored on reopen (which sessions, in order).
  const PANES_KEY = 'aidx-qt-panes'
  const readPaneIds = (): string[] =>
    readStorage(
      PANES_KEY,
      (raw) => {
        const arr: unknown = JSON.parse(raw)
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : undefined
      },
      [],
    )
  const writePaneIds = (ids: (string | null)[]) => writeStorage(PANES_KEY, ids.filter((x): x is string => Boolean(x)), JSON.stringify)
  // The current session id of each pane (null until its client resolves), for layout persistence.
  const paneIds = (): (string | null)[] => panes().map((p) => p.client.sessionId())
  // Closing a pane deletes its server record so they don't accumulate orphans.
  const forgetSession = (client: SessionClient) => {
    if (client.sessionId()) void client.remove().catch(() => {})
  }

  // Remember which pane was active (by position) so reopening focuses the same one.
  const FOCUS_KEY = 'aidx-qt-focused'
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

  const addPane = (initialId?: string) => {
    const id = ++seq
    const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
    const [working, setWorking] = createSignal(false)
    // Each pane owns its session client. Restore a persisted aidx_ id, else resolve a fresh session.
    const client = defineClient({apiBase: props.panel.apiBase ?? ''})
    if (initialId && isSessionId(initialId)) client.setSessionId(SessionId.parse(initialId))
    else void client.resolve().then((r) => client.setSessionId(r.sessionId))
    // Each pane is its own session; it's the focused one that takes composer focus + hydrates.
    const content = props.panel.create({
      active: () => props.open() && focused() === id,
      onWorkingChange: setWorking,
      onUsageChange: setUsage,
      // A just-born session shows in every selector before its file flushes (surface union).
      onSessionLabel: (name) => {
        const sid = client.sessionId()
        mergeSurface(sid, sid ? makeSurfaceRow(sid, name) : null)
      },
      client,
      announce: props.announce,
      composerActions: props.composerActions,
      composerControls: props.composerControls,
    })
    setPanes((ps) => [...ps, {id, client, content, usage, working}])
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
      props.setOpen(false) // last pane closes the terminal; re-seeded on next open
      return
    }
    const refocus = focused() === id
    setPanes(remaining)
    if (refocus) focusPane(remaining[remaining.length - 1]!.id)
    // Clear any frozen widths from gutter drags so survivors redistribute (lone pane → full width).
    if (rowEl) for (const el of rowEl.querySelectorAll<HTMLElement>('.pw-qt-pane')) el.style.flex = ''
  }

  // Closed, the sheet only slides off-screen (it stays in the DOM to keep pane state), so mark it
  // inert — otherwise its composer/buttons stay tabbable and trip the aria-hidden-focus rule.
  createEffect(() => {
    if (sectionEl) sectionEl.inert = !props.open()
  })

  // Seed panes up front (not lazily on open) so each ChatPanel is mounted from the start — opening
  // then only flips `active`, the same path the modal uses to focus its composer reliably. (A pane
  // created inside the open handler races the mount + drop animation and misses focus.) Restore the
  // saved layout (one pane per persisted session id); else seed one fresh pane.
  const savedIds = readPaneIds()
  if (savedIds.length > 0) for (const sid of savedIds) addPane(sid)
  else addPane()

  // On open: restore focus to the last-active pane (persisted). Setting focused flips that pane's
  // `active` true, and its ChatPanel focuses the composer.
  let wasOpen = false
  let restoreFocus: HTMLElement | null = null
  createEffect(() => {
    const open = props.open()
    if (open && !wasOpen) {
      // Remember what had focus on the page so closing returns there (the sheet has no trigger).
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const target = panes()[Math.min(readFocusIndex(), panes().length - 1)]
      if (target) setFocused(target.id)
    } else if (!open && wasOpen) {
      restoreFocus?.focus()
      restoreFocus = null
    }
    wasOpen = open
  })

  // Each configured binding toggles the sheet; Escape closes it; Mod+D splits while open.
  for (const binding of props.hotkeys) {
    createHotkey(binding as Bindable, () => props.setOpen(!props.open()))
  }
  createHotkey('Escape', () => props.setOpen(false), () => ({enabled: props.open()}))
  createHotkey('Mod+d' as Bindable, () => addPane(), () => ({enabled: props.open()}))

  // Gutter drag: redistribute width between the two adjacent panes (ported from the mockup).
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
      class={props.open() ? 'pw-qt pw-qt-open' : 'pw-qt'}
      classList={{'pw-pick-away': picking()}}
      style={{height: `${resize.size()}px`}}
      role="dialog"
      aria-label="aidx quick terminal"
      aria-hidden={!props.open()}
    >
      <header class="pw-qt-head">
        <span class="pw-qt-brand">
          <span class="pw-qt-spark" aria-hidden="true">
            ✦
          </span>
          {props.panel.title}
        </span>
        <span class="pw-qt-mode">quick terminal</span>
        <span class="pw-qt-spacer" />
        <button
          type="button"
          class="pw-chat-close"
          aria-label="Pop out to a window"
          title="Picture-in-Picture"
          onClick={() => sectionEl && pip.open(sectionEl, {title: 'aidx quick terminal'})}
        >
          <PictureInPicture2 class="pw-icon" aria-hidden="true" />
        </button>
        <button type="button" class="pw-chat-close" aria-label="Split pane" title="Split pane (Mod+D)" onClick={() => addPane()}>
          <Columns2 class="pw-icon" aria-hidden="true" />
        </button>
        <button type="button" class="pw-chat-close" aria-label="Close quick terminal" onClick={() => props.setOpen(false)}>
          <ChevronUp class="pw-chevron" aria-hidden="true" />
        </button>
      </header>
      <div
        class="pw-qt-body"
        ref={(el) => {
          rowEl = el
        }}
      >
        <For each={panes()}>
          {(pane, i) => (
            <>
              <Show when={i() > 0}>
                <div class="pw-qt-gutter" aria-hidden="true" onPointerDown={onGutterDown} />
              </Show>
              <div
                class={focused() === pane.id ? 'pw-qt-pane focused' : 'pw-qt-pane'}
                onPointerDown={() => focusPane(pane.id)}
                onFocusIn={() => {
                  if (focused() !== pane.id) focusPane(pane.id)
                }}
              >
                <div class="pw-qt-pane-bar">
                  <SessionSelector
                    variant="bar"
                    apiBase={props.panel.apiBase ?? ''}
                    activeId={() => pane.client.sessionId()}
                    onActivate={(id) => pane.client.setSessionId(id)}
                    lockedElsewhere={(id) => (sessions().find((s) => s.id === id)?.running ?? false) && id !== pane.client.sessionId()}
                    announce={props.announce}
                  />
                  <ContextTracker usage={pane.usage()} />
                  <button
                    type="button"
                    class="pw-qt-pane-x"
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
        class="pw-qt-grip"
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
