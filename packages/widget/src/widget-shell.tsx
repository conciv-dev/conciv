import {createSignal, Show, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import type {TriggerPosition} from '@aidx/protocol/config-types'
import type {WidgetSettings} from './widget-settings.js'
import {createDraggablePosition} from './draggable-position.js'
import {createResizable} from './resize.js'
import {QuickTerminalLayout} from './quick-terminal.js'
import {createPiP} from './pip.js'
import {ChevronDown, PictureInPicture2} from 'lucide-solid'

// A registered content module the shell hosts, modeled on the TanStack Devtools plugin model.
// `create` returns a fresh content element each call (the modal uses one; quick-terminal panes
// will each create their own), wired to the surface via the context.
export type PanelContext = {
  // The surface hosting this content is open/focused — drives composer focus + lazy hydrate.
  active: () => boolean
  // The content reports whether the agent is working, so the shell can pulse the trigger.
  onWorkingChange: (working: boolean) => void
}
export type PanelDef = {
  id: string
  title: string
  create: (ctx: PanelContext) => JSX.Element
}

// The widget shell. Owns the chrome (trigger, layout modes, settings) and hosts panels.
// A factory closure rather than a class (analogue of TanStack Devtools' TanStackDevtoolsCore).
export function createWidgetShell(opts: {settings: WidgetSettings}): {
  registerPanel: (def: PanelDef) => void
  mount: (rootEl: ShadowRoot | HTMLElement) => void
  unmount: () => void
} {
  const panels: PanelDef[] = []
  let dispose: (() => void) | undefined
  return {
    registerPanel(def) {
      panels.push(def)
    },
    mount(rootEl) {
      const container = document.createElement('div')
      rootEl.appendChild(container)
      dispose = render(() => <Shell settings={opts.settings} panels={panels} />, container)
    },
    unmount() {
      dispose?.()
      dispose = undefined
    },
  }
}

function Shell(props: {settings: WidgetSettings; panels: PanelDef[]}): JSX.Element {
  // One layer is visible at a time, so opening the quick terminal closes the modal and vice versa.
  const [layer, setLayer] = createSignal<'modal' | 'quick' | null>(null)
  const setQuickOpen = (v: boolean) => setLayer((prev) => (v ? 'quick' : prev === 'quick' ? null : prev))
  const closeModal = () => setLayer((prev) => (prev === 'modal' ? null : prev))
  return (
    <Show when={props.panels[0]}>
      {(panel) => (
        <>
          <Show when={props.settings.modal.enabled}>
            <ModalLayout
              panel={panel()}
              position={props.settings.modal.position}
              open={() => layer() === 'modal'}
              onOpen={() => setLayer('modal')}
              onClose={closeModal}
            />
          </Show>
          <Show when={props.settings.quickTerminal.enabled}>
            <QuickTerminalLayout
              panel={panel()}
              hotkeys={props.settings.quickTerminal.hotkeys}
              open={() => layer() === 'quick'}
              setOpen={setQuickOpen}
            />
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
  position: TriggerPosition
  open: () => boolean
  onOpen: () => void
  onClose: () => void
}): JSX.Element {
  const [working, setWorking] = createSignal(false)
  const fab = createDraggablePosition({initial: props.position, storageKey: 'aidx-fab-position'})
  const pip = createPiP()
  let fabEl: HTMLButtonElement | undefined
  let panelEl: HTMLElement | undefined

  const fabPulsing = () => !props.open() && working()
  const content = props.panel.create({active: () => props.open(), onWorkingChange: setWorking})

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
