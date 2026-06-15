import {createEffect, createSignal, onCleanup, Show, type Component, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {EnvironmentProvider} from '@ark-ui/solid/environment'
import type {TriggerPosition} from '@aidx/protocol/config-types'
import type {WidgetSettings} from './widget-settings.js'
import {createDraggablePosition} from './draggable-position.js'
import {createResizable} from './resize.js'
import {QuickTerminalLayout} from './quick-terminal.js'
import {createPiP} from './pip.js'
import {ChevronDown, Crosshair, PictureInPicture2} from 'lucide-solid'
import {picking, cancelPick} from './react-grab/picking.js'
import {ContextTracker} from './context-tracker.js'
import type {UsageSnapshot} from '@aidx/protocol/usage-types'

// A registered content module the shell hosts, modeled on the TanStack Devtools plugin model.
// `create` returns a fresh content element each call (the modal uses one; quick-terminal panes
// will each create their own), wired to the surface via the context.
export type PanelContext = {
  // The surface hosting this content is open/focused — drives composer focus + lazy hydrate.
  active: () => boolean
  // The content reports whether the agent is working, so the shell can pulse the trigger.
  onWorkingChange: (working: boolean) => void
  // The content reports its latest model-usage snapshot, for the top-bar context tracker.
  onUsageChange: (usage: UsageSnapshot | null) => void
  // Composer-action buttons registered on the shell, rendered in each panel's composer row.
  composerActions: () => ComposerActionDef[]
  // Composer-control plugins (stateful widgets, e.g. the model selector), rendered in the same row.
  composerControls: () => ComposerControlDef[]
}
export type PanelDef = {
  id: string
  title: string
  create: (ctx: PanelContext) => JSX.Element
}

// A handle to the live composer a button was clicked in, so output routes to the right composer
// even with multiple mounted. This is a CAPABILITY BAG, not a text-only API: the composer owns all
// draft state (text today; attachments once chat-image-input lands), so future actions like
// "add attachment" extend the bag rather than reshaping the registry.
export type ComposerActionContext = {
  insert: (text: string) => void // append text to this composer's input + focus it
  setBusy: (busy: boolean) => void
  apiBase: string
  // Session/thread lifecycle. The composer owns thread + usage state; actions drive it through these
  // rather than reaching into useChat.
  addDivider: (kind: 'new' | 'compact') => void // mark a session boundary in the scrollback (prior thread stays)
  resetUsage: () => void // clear the context tracker (no turn ran)
  compact: () => Promise<void> // run the compaction turn out of band: marks a boundary, shows no chat output
  // FUTURE (chat-image-input plan): addAttachment: (file: File | Blob) => void
}
// A button in the composer's actions row, registered on the shell (mirrors registerPanel).
export type ComposerActionDef = {
  id: string
  label: string // aria-label / tooltip
  icon: Component<{class?: string}>
  onClick: (ctx: ComposerActionContext) => void | Promise<void>
}

// What a composer control gets from the host composer. It renders persistent, stateful UI (vs a
// ComposerActionDef's one-shot button) and can attach per-turn request metadata — the composer
// merges `setRequestMeta` patches into the next turn's POST body, staying ignorant of their meaning.
export type ComposerControlContext = {
  apiBase: string
  setRequestMeta: (patch: Record<string, unknown>) => void
}
// A stateful control rendered into the composer's actions row (e.g. the model selector). `create`
// returns a fresh element per composer, mirroring PanelDef.create.
export type ComposerControlDef = {
  id: string
  create: (ctx: ComposerControlContext) => JSX.Element
}

// The widget shell. Owns the chrome (trigger, layout modes, settings) and hosts panels.
// A factory closure rather than a class (analogue of TanStack Devtools' TanStackDevtoolsCore).
export function createWidgetShell(opts: {settings: WidgetSettings}): {
  registerPanel: (def: PanelDef) => void
  registerComposerAction: (def: ComposerActionDef) => void
  registerComposerControl: (def: ComposerControlDef) => void
  mount: (rootEl: ShadowRoot | HTMLElement) => void
  unmount: () => void
} {
  const panels: PanelDef[] = []
  const composerActions: ComposerActionDef[] = []
  const composerControls: ComposerControlDef[] = []
  let dispose: (() => void) | undefined
  return {
    registerPanel(def) {
      panels.push(def)
    },
    registerComposerAction(def) {
      composerActions.push(def)
    },
    registerComposerControl(def) {
      composerControls.push(def)
    },
    mount(rootEl) {
      const container = document.createElement('div')
      rootEl.appendChild(container)
      // Ark UI (Zag) resolves its DOM via the environment's root node; inside our open Shadow DOM it
      // must be told the shadow root, or element lookups hit `document`, find nothing, and popovers
      // render at 0,0 with dead clicks. rootEl is the shadow root (HTMLElement only in tests).
      dispose = render(
        () => (
          <EnvironmentProvider value={() => rootEl}>
            <Shell
              settings={opts.settings}
              panels={panels}
              composerActions={() => composerActions}
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
  // One layer is visible at a time, so opening the quick terminal closes the modal and vice versa.
  const [layer, setLayer] = createSignal<'modal' | 'quick' | null>(null)
  const setQuickOpen = (v: boolean) => setLayer((prev) => (v ? 'quick' : prev === 'quick' ? null : prev))
  const closeModal = () => setLayer((prev) => (prev === 'modal' ? null : prev))

  // Esc cancels an in-progress element pick (react-grab handles it too; this is a safety net and
  // covers the pill being focused).
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
              open={() => layer() === 'quick'}
              setOpen={setQuickOpen}
            />
          </Show>
          {/* While picking, the open surface goes click-through+invisible; this pill is the only chrome. */}
          <Show when={picking()}>
            <button type="button" class="pw-pick-pill" onClick={() => cancelPick()} aria-label="Cancel element pick">
              <Crosshair class="pw-pick-pill-icon" aria-hidden="true" />
              <span>Picking…</span>
              <kbd class="pw-pick-kbd">Esc</kbd>
            </button>
          </Show>
        </>
      )}
    </Show>
  )
}

// Focusable controls inside the open dialog, in DOM order — used to wrap Tab focus.
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute('disabled'))
}

function panelClass(open: boolean, position: TriggerPosition): string {
  const base = `pw-chat-panel pw-panel-pos-${position}`
  return open ? `${base} pw-chat-open` : base
}

function fabClass(pulsing: boolean, position: TriggerPosition, dragging: boolean): string {
  let cls = `pw-chat-fab pw-fab-pos-${position}`
  if (pulsing) cls += ' pw-chat-fab-attn'
  if (dragging) cls += ' pw-fab-dragging'
  return cls
}

// Corner-modal layout: the FAB (configurable position, drag-to-reposition) and the floating panel
// wrapping a panel's content. The content stays mounted across open/close so chat state persists
// and the FAB can pulse while the agent works with the panel closed.
function ModalLayout(props: {
  panel: PanelDef
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
  position: TriggerPosition
  open: () => boolean
  onOpen: () => void
  onClose: () => void
}): JSX.Element {
  const [working, setWorking] = createSignal(false)
  const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
  const fab = createDraggablePosition({initial: props.position, storageKey: 'aidx-fab-position'})
  const pip = createPiP()
  let fabEl: HTMLButtonElement | undefined
  let panelEl: HTMLElement | undefined

  const fabPulsing = () => !props.open() && working()
  const content = props.panel.create({
    active: () => props.open(),
    onWorkingChange: setWorking,
    onUsageChange: setUsage,
    composerActions: props.composerActions,
    composerControls: props.composerControls,
  })

  // The panel resizes off whichever edges are free (away from its anchored corner): a bottom-anchored
  // panel grows height upward, a top/middle one downward; a right-anchored panel grows width leftward,
  // a left one rightward.
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
    storageKey: 'aidx-modal-height',
    grow: () => (anchoredBottom() ? 'up' : 'down'),
    onCollapse: () => closePanel(),
  })
  const resizeX = createResizable({
    initial: 380,
    min: 300,
    storageKey: 'aidx-modal-width',
    grow: () => (anchoredRight() ? 'left' : 'right'),
  })
  const toggle = () => (props.open() ? closePanel() : props.onOpen())

  const onPanelKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePanel()
      return
    }
    if (e.key !== 'Tab' || !panelEl) return
    const items = focusablesIn(panelEl)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const root = panelEl.getRootNode()
    const active = root instanceof ShadowRoot ? root.activeElement : null
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last?.focus()
      return
    }
    if (!e.shiftKey && active === last) {
      e.preventDefault()
      first?.focus()
    }
  }

  return (
    <>
      <section
        ref={(el) => {
          panelEl = el
        }}
        class={panelClass(props.open(), fab.position())}
        classList={{'pw-pick-away': picking()}}
        style={{height: `${resizeY.size()}px`, width: `${resizeX.size()}px`}}
        role="dialog"
        aria-label="aidx chat agent"
        aria-hidden={!props.open()}
        id="pw-chat-panel"
        onKeyDown={onPanelKeyDown}
      >
        <div
          class={`pw-chat-resize pw-chat-resize-y ${anchoredBottom() ? 'pw-chat-resize-top' : 'pw-chat-resize-bottom'}`}
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
          class={`pw-chat-resize pw-chat-resize-x ${anchoredRight() ? 'pw-chat-resize-left' : 'pw-chat-resize-right'}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat width"
          aria-valuemin={300}
          aria-valuenow={Math.round(resizeX.size())}
          tabindex={0}
          onPointerDown={resizeX.onPointerDown}
          onKeyDown={resizeX.onKeyDown}
        />
        <header class="pw-chat-head">
          <button
            type="button"
            class="pw-chat-close"
            aria-label="Pop out to a window"
            title="Picture-in-Picture"
            onClick={() => panelEl && pip.open(panelEl, {title: props.panel.title})}
          >
            <PictureInPicture2 class="pw-icon" aria-hidden="true" />
          </button>
          <span class="pw-chat-title">{props.panel.title}</span>
          <ContextTracker usage={usage()} />
          <button type="button" class="pw-chat-close" aria-label="Close chat" onClick={closePanel}>
            <ChevronDown class="pw-chevron" aria-hidden="true" />
          </button>
        </header>
        {content}
      </section>
      <button
        type="button"
        ref={(el) => {
          fabEl = el
        }}
        class={fabClass(fabPulsing(), fab.position(), fab.dragging())}
        classList={{'pw-pick-away': picking()}}
        style={fab.dragStyle()}
        aria-label="Open aidx chat"
        aria-expanded={props.open()}
        aria-controls="pw-chat-panel"
        onPointerDown={fab.onPointerDown}
        onClick={() => {
          if (!fab.consumeClick()) toggle()
        }}
      >
        <span class="pw-fab-icon" aria-hidden="true">
          {props.open() ? <ChevronDown class="pw-chevron" aria-hidden="true" /> : '✦'}
        </span>
      </button>
    </>
  )
}
