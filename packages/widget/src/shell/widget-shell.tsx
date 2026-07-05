import {createEffect, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {EnvironmentProvider, FocusTrap} from '@conciv/ui-kit-system'
import {ApprovalModal, type PendingApproval} from './approval-modal.js'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import type {WidgetSettings} from '../client/widget-settings.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import {createResizable} from '../lib/resize.js'
import {QuickTerminalLayout} from './quick-terminal.js'
import {createPiP} from './pip.js'
import {ChevronDown, Crosshair, PictureInPicture2} from 'lucide-solid'
import {FabRobot} from './fab-robot.js'
import {picking, cancelPick} from '../page/react-grab/picking.js'
import {suppressedAttr} from './suppression.js'
import {ContextTracker} from '../page/context-tracker.js'
import {SessionSelector} from '../composer/session-selector.js'
import {sessions} from '../client/session-store-client.js'
import {readShellSnapshotOrDefault, writeShellSnapshot} from '../lib/ui-snapshot.js'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import {createModalPanes, type ModalPane} from './modal-panes.js'
import {escapeInTerminal} from './terminal-focus.js'
import {CLOSE, type ComposerActionDef, type ComposerControlDef, type PanelDef} from './shell-contract.js'

export function createWidgetShell(opts: {settings: WidgetSettings}): {
  registerPanel: (def: PanelDef) => void
  registerComposerAction: (def: ComposerActionDef) => void
  registerComposerControl: (def: ComposerControlDef) => void
  mount: (rootEl: ShadowRoot | HTMLElement) => void
  unmount: () => void
} {
  const panels: PanelDef[] = []
  const [composerActions, setComposerActions] = createSignal<ComposerActionDef[]>([])
  const composerControls: ComposerControlDef[] = []
  let dispose: (() => void) | undefined
  return {
    registerPanel(def) {
      panels.push(def)
    },
    registerComposerAction(def) {
      setComposerActions((prev) =>
        prev.some((a) => a.id === def.id) ? prev.map((a) => (a.id === def.id ? def : a)) : [...prev, def],
      )
    },
    registerComposerControl(def) {
      composerControls.push(def)
    },
    mount(rootEl) {
      const container = document.createElement('div')

      container.className = 'chat-theme-conciv'
      rootEl.appendChild(container)

      dispose = render(
        () => (
          <EnvironmentProvider value={() => rootEl}>
            <Shell
              settings={opts.settings}
              panels={panels}
              composerActions={composerActions}
              composerControls={() => composerControls}
            />
          </EnvironmentProvider>
        ),
        container,
      )
    },
    unmount() {
      dispose?.()
      dispose = undefined
    },
  }
}

function Shell(props: {
  settings: WidgetSettings
  panels: PanelDef[]
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
}): JSX.Element {
  const restoredShell = readShellSnapshotOrDefault()
  const [layer, setLayer] = createSignal<'modal' | 'quick' | null>(restoredShell.layer)
  const setQuickOpen = (v: boolean) => setLayer((prev) => (v ? 'quick' : prev === 'quick' ? null : prev))
  const closeModal = () => setLayer((prev) => (prev === 'modal' ? null : prev))

  const [modalPaneIds, setModalPaneIds] = createSignal<string[]>(restoredShell.paneIds)
  createEffect(() => writeShellSnapshot({layer: layer(), paneIds: modalPaneIds()}))

  const [politeMsg, setPoliteMsg] = createSignal('')
  const [assertiveMsg, setAssertiveMsg] = createSignal('')
  const announce = (msg: string, assertive = false) => (assertive ? setAssertiveMsg(msg) : setPoliteMsg(msg))

  const [approvalsByPane, setApprovalsByPane] = createSignal<Record<string, PendingApproval[]>>({})
  const reportApprovals = (key: string, items: PendingApproval[]) =>
    setApprovalsByPane((prev) => ({...prev, [key]: items}))
  const pendingApprovals = () => Object.values(approvalsByPane()).flat()

  createEffect(() => {
    if (!picking()) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelPick()
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => document.removeEventListener('keydown', onKey))
  })

  return (
    <Show when={props.panels[0]}>
      {(panel) => (
        <>
          <Show when={props.settings.modal.enabled}>
            <ModalLayout
              panel={panel()}
              composerActions={props.composerActions}
              composerControls={props.composerControls}
              position={props.settings.modal.position}
              announce={announce}
              reportApprovals={reportApprovals}
              onPanesChange={setModalPaneIds}
              open={() => layer() === 'modal'}
              onOpen={() => setLayer('modal')}
              onClose={closeModal}
            />
          </Show>
          <Show when={props.settings.quickTerminal.enabled}>
            <QuickTerminalLayout
              panel={panel()}
              composerActions={props.composerActions}
              composerControls={props.composerControls}
              hotkeys={props.settings.quickTerminal.hotkeys}
              announce={announce}
              reportApprovals={reportApprovals}
              open={() => layer() === 'quick'}
              setOpen={setQuickOpen}
            />
          </Show>
          <ApprovalModal visible={() => layer() !== 'modal'} approvals={pendingApprovals} />
          <div class="sr-only" role="status" aria-live="polite">
            {politeMsg()}
          </div>
          <div class="sr-only" role="alert" aria-live="assertive">
            {assertiveMsg()}
          </div>
          {}
          <Show when={picking()}>
            <button
              type="button"
              class="text-[0.8125rem] text-pw-text-hi pb-2 pl-3 pr-2.5 pt-2 border border-pw-accent-line rounded-pw-pill bg-pw-glass inline-flex gap-2 cursor-pointer [backdrop-filter:blur(0.5rem)] shadow-pw trans-chip items-center bottom-6 left-1/2 fixed z-[2147483647] hover:border-pw-accent hover:bg-pw-panel -translate-x-1/2"
              onClick={() => cancelPick()}
              aria-label="Cancel element pick"
            >
              <Crosshair class="text-pw-accent size-4" aria-hidden="true" />
              <span>Picking…</span>
              <kbd class="text-[0.6875rem] text-pw-text-2 px-[0.3125rem] py-px border border-pw-line-2 rounded-[0.3125rem] [font-family:inherit]">
                Esc
              </kbd>
            </button>
          </Show>
        </>
      )}
    </Show>
  )
}

const FAB_POS: Record<TriggerPosition, string> = {
  'top-left': 'top-5 left-5',
  'top-right': 'top-5 right-5',
  'middle-left': 'top-[calc(50%-1.625rem)] left-5',
  'middle-right': 'top-[calc(50%-1.625rem)] right-5',
  'bottom-left': 'bottom-5 left-5',
  'bottom-right': 'bottom-5 right-5',
}
const PANEL_POS: Record<TriggerPosition, string> = {
  'top-left': 'top-21 left-5 [transform-origin:top_left]',
  'top-right': 'top-21 right-5 [transform-origin:top_right]',
  'middle-left': 'top-21 left-5 [transform-origin:top_left]',
  'middle-right': 'top-21 right-5 [transform-origin:top_right]',
  'bottom-left': 'bottom-21 left-5 [transform-origin:bottom_left]',
  'bottom-right': 'bottom-21 right-5 [transform-origin:bottom_right]',
}
const FAB_BASE =
  'fixed size-13 rounded-pw-pill border border-pw-line bg-pw-panel text-pw-accent text-[1.375rem] cursor-pointer pointer-events-auto shadow-pw-lg inline-flex items-center justify-center trans-lift anim-fab hover:[transform:translateY(-0.125rem)] hover:shadow-pw-hover active:[transform:translateY(0)_scale(0.94)]'
const FAB_ATTN =
  "after:content-[''] after:absolute after:-inset-[0.1875rem] after:rounded-pw-pill after:border-2 after:border-pw-accent after:anim-fab-ring"
const FAB_DRAGGING = 'transition-none z-[2147483647] cursor-grabbing'
const PANEL_BASE =
  'fixed w-120 max-w-[calc(100vw-2.5rem)] h-140 max-h-[calc(100vh-7.5rem)] flex flex-col bg-pw-glass border border-pw-line-soft rounded-pw-lg shadow-pw-lg text-pw-text font-normal text-[0.875rem] leading-[1.45] font-pw overflow-hidden'
const PANEL_CLOSED = 'opacity-0 [transform:scale(0.96)_translateY(0.5rem)] pointer-events-none invisible trans-pop-out'
const PANEL_OPEN = 'opacity-100 [transform:none] pointer-events-auto visible trans-pop-in'

const RESIZE = 'absolute z-[3] focus-visible:outline-none focus-visible:bg-pw-accent-20 focus-visible:ring-inset-accent'
const RESIZE_Y = 'left-0 right-0 h-2 cursor-ns-resize'
const RESIZE_X = 'top-0 bottom-0 w-2 cursor-ew-resize'
const HEAD = 'flex items-center gap-2.5 py-3 px-3.5 border-b border-b-pw-line-soft'

const MODAL_PANE = 'flex-col flex-[1_1_auto] min-h-0'

function panelClass(open: boolean, position: TriggerPosition): string {
  return `${PANEL_BASE} ${PANEL_POS[position]} ${open ? PANEL_OPEN : PANEL_CLOSED}`
}

function fabClass(pulsing: boolean, position: TriggerPosition, dragging: boolean): string {
  return `${FAB_BASE} ${FAB_POS[position]}${pulsing ? ` ${FAB_ATTN}` : ''}${dragging ? ` ${FAB_DRAGGING}` : ''}`
}

function resizeEdgeY(anchoredBottom: boolean): string {
  return anchoredBottom ? 'top-0' : 'bottom-0'
}

function resizeEdgeX(anchoredRight: boolean): string {
  return anchoredRight ? 'left-0' : 'right-0'
}

function fabLabel(open: boolean): string {
  return open ? 'Minimize conciv chat' : 'Open conciv chat'
}

function ModalHeader(props: {
  title: string
  apiBase: string
  activeId: () => SessionId | null
  onActivate: (id: SessionId) => void
  usage: () => UsageSnapshot | null
  announce: (msg: string, assertive?: boolean) => void
  onPip: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <header class={HEAD}>
      <button
        type="button"
        class={CLOSE}
        aria-label="Pop out to a window"
        title="Picture-in-Picture"
        onClick={props.onPip}
      >
        <PictureInPicture2 class="size-5 block" aria-hidden="true" />
      </button>
      <span class="tracking-[-0.01em] font-semibold">{props.title}</span>
      <SessionSelector
        variant="pill"
        apiBase={props.apiBase}
        activeId={props.activeId}
        onActivate={props.onActivate}
        lockedElsewhere={(id) => (sessions().find((s) => s.id === id)?.running ?? false) && id !== props.activeId()}
        announce={props.announce}
      />
      <ContextTracker usage={props.usage()} />
      <button type="button" class={`${CLOSE} ml-auto`} aria-label="Close chat" onClick={props.onClose}>
        <ChevronDown class="size-[1em] block" aria-hidden="true" />
      </button>
    </header>
  )
}

function ModalPaneList(props: {panes: () => ModalPane[]; activeId: () => SessionId | null}): JSX.Element {
  return (
    <For each={props.panes()}>
      {(pane) => (
        <div
          class={MODAL_PANE}
          classList={{flex: props.activeId() === pane.id, hidden: props.activeId() !== pane.id}}
          data-pw-modal-hidden={props.activeId() !== pane.id ? '' : undefined}
        >
          {pane.content}
        </div>
      )}
    </For>
  )
}

function ShellFab(props: {
  ref: (el: HTMLButtonElement) => void
  open: () => boolean
  working: () => boolean
  fab: ReturnType<typeof createDraggablePosition>
  onToggle: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      ref={props.ref}
      class={fabClass(!props.open() && props.working(), props.fab.position(), props.fab.dragging())}
      data-pw-fab
      data-pw-suppressed={suppressedAttr()}
      style={props.fab.dragStyle()}
      aria-label={fabLabel(props.open())}
      aria-expanded={props.open()}
      aria-controls="pw-chat-panel"
      onPointerDown={props.fab.onPointerDown}
      onClick={() => {
        if (!props.fab.consumeClick()) props.onToggle()
      }}
    >
      {}
      <FabRobot open={props.open} working={props.working} />
    </button>
  )
}

function ModalLayout(props: {
  panel: PanelDef
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
  position: TriggerPosition
  announce: (msg: string, assertive?: boolean) => void
  reportApprovals: (key: string, approvals: PendingApproval[]) => void
  onPanesChange: (ids: string[]) => void
  open: () => boolean
  onOpen: () => void
  onClose: () => void
}): JSX.Element {
  const store = createModalPanes({
    panel: props.panel,
    open: props.open,
    reportApprovals: props.reportApprovals,
    announce: props.announce,
    composerActions: props.composerActions,
    composerControls: props.composerControls,
  })
  createEffect(() => props.onPanesChange(store.paneIds()))

  const fab = createDraggablePosition({initial: props.position, storageKey: 'conciv-fab-position'})
  const pip = createPiP()
  let fabEl: HTMLButtonElement | undefined
  let panelEl: HTMLElement | undefined

  const anchoredBottom = () => fab.position().startsWith('bottom')
  const anchoredRight = () => fab.position().endsWith('right')
  const closePanel = () => {
    if (!props.open()) return
    props.onClose()
    fabEl?.focus()
  }
  const resizeY = createResizable({
    initial: 560,
    min: 240,
    collapseAt: 140,
    storageKey: 'conciv-modal-height',
    grow: () => (anchoredBottom() ? 'up' : 'down'),
    onCollapse: () => closePanel(),
  })
  const resizeX = createResizable({
    initial: 480,
    min: 448,
    storageKey: 'conciv-modal-width',
    grow: () => (anchoredRight() ? 'left' : 'right'),
  })
  const toggle = () => (props.open() ? closePanel() : props.onOpen())

  const onPanelKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (escapeInTerminal(panelEl)) return
    e.preventDefault()
    closePanel()
  }

  return (
    <>
      <FocusTrap disabled={!props.open()}>
        <section
          ref={(el) => {
            panelEl = el
          }}
          class={panelClass(props.open(), fab.position())}
          data-pw-panel
          data-pw-suppressed={suppressedAttr()}
          style={{height: `${resizeY.size()}px`, width: `${resizeX.size()}px`}}
          role="dialog"
          aria-label="conciv chat agent"
          aria-hidden={!props.open()}
          id="pw-chat-panel"
          onKeyDown={onPanelKeyDown}
        >
          <div
            class={`${RESIZE}  ${RESIZE_Y}  ${resizeEdgeY(anchoredBottom())}`}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize chat height"
            aria-valuemin={240}
            aria-valuenow={Math.round(resizeY.size())}
            tabindex={0}
            onPointerDown={resizeY.onPointerDown}
            onKeyDown={resizeY.onKeyDown}
          />
          <div
            class={`${RESIZE}  ${RESIZE_X}  ${resizeEdgeX(anchoredRight())}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat width"
            aria-valuemin={300}
            aria-valuenow={Math.round(resizeX.size())}
            tabindex={0}
            onPointerDown={resizeX.onPointerDown}
            onKeyDown={resizeX.onKeyDown}
          />
          <ModalHeader
            title={props.panel.title}
            apiBase={store.apiBase}
            activeId={store.activeId}
            onActivate={store.activate}
            usage={store.usage}
            announce={props.announce}
            onPip={() => panelEl && pip.open(panelEl, {title: props.panel.title})}
            onClose={closePanel}
          />
          {}
          <ModalPaneList panes={store.panes} activeId={store.activeId} />
        </section>
      </FocusTrap>
      <ShellFab
        ref={(el) => {
          fabEl = el
        }}
        open={props.open}
        working={store.working}
        fab={fab}
        onToggle={toggle}
      />
    </>
  )
}
