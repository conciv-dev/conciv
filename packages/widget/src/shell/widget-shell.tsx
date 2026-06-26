import {createEffect, createSignal, For, onCleanup, Show, type Component, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {EnvironmentProvider} from '@mandarax/ui-kit-system'
import type {TriggerPosition} from '@mandarax/protocol/config-types'
import type {WidgetSettings} from '../client/widget-settings.js'
import {createDraggablePosition} from '../lib/draggable-position.js'
import {createResizable} from '../lib/resize.js'
import {QuickTerminalLayout} from './quick-terminal.js'
import {createPiP} from './pip.js'
import {ChevronDown, Crosshair, PictureInPicture2} from 'lucide-solid'
import {FabRobot} from './fab-robot.js'
import {picking, cancelPick} from '../page/react-grab/picking.js'
import {ContextTracker} from '../page/context-tracker.js'
import {SessionSelector} from '../composer/session-selector.js'
import {sessions, mergeSurface, makeSurfaceRow} from '../client/session-store-client.js'
import {readStorage, writeStorage} from '../lib/persisted-signal.js'
import {defineClient, type SessionClient} from '@mandarax/api-client'
import {SessionId, isSessionId} from '@mandarax/protocol/chat-types'
import type {UsageSnapshot} from '@mandarax/protocol/usage-types'
import type {Grab} from '@mandarax/grab'

// Read our persisted active id, accepting only a valid mandarax_ id (a stale/foreign value is dropped).
const parseActiveId = (raw: string): SessionId | undefined => (isSessionId(raw) ? SessionId.parse(raw) : undefined)

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
  // This surface's session client — owns the active mandarax_ id, the single comms seam for the panel.
  client: SessionClient
  // The content reports its resolved session name, so the chrome can surface a just-born row.
  onSessionLabel?: (name: string | null) => void
  // Optional "new session" handler the surface provides (the modal opens a fresh panel).
  onNewSession?: () => void | Promise<void>
  // Shell-level live-region writer (outside any inert pane) for switch/error announcements.
  announce?: (msg: string, assertive?: boolean) => void
  // Composer-action buttons registered on the shell, rendered in each panel's composer row.
  composerActions: () => ComposerActionDef[]
  // Composer-control plugins (stateful widgets, e.g. the model selector), rendered in the same row.
  composerControls: () => ComposerControlDef[]
}
export type PanelDef = {
  id: string
  title: string
  // The API base the panel talks to — also used by the chrome's SessionSelector (same backend).
  apiBase?: string
  create: (ctx: PanelContext) => JSX.Element
}

// A handle to the live composer a button was clicked in, so output routes to the right composer
// even with multiple mounted. This is a CAPABILITY BAG, not a text-only API: the composer owns all
// draft state (text today; attachments once chat-image-input lands), so future actions like
// "add attachment" extend the bag rather than reshaping the registry.
export type ComposerActionContext = {
  insert: (text: string) => void // append text to this composer's input + focus it
  // Stage a grabbed element: insert its text context AND show the preview chip as one unit, so
  // removing the chip later strips exactly that inserted text and nothing else.
  stageGrab: (grab: Grab) => void
  setBusy: (busy: boolean) => void
  apiBase: string
  // The active surface's session client (resolve a new session, launch the current one, etc.).
  client: SessionClient
  // Session/thread lifecycle. The composer owns thread + usage state; actions drive it through these
  // rather than reaching into useChat.
  addDivider: (kind: 'new' | 'compact') => void // mark a session boundary in the scrollback (prior thread stays)
  newSession: () => void | Promise<void> // start a fresh session (modal opens a new pane; else in-place)
  resetUsage: () => void // clear the context tracker (no turn ran)
  compact: () => Promise<void> // run the compaction turn out of band: marks a boundary, shows no chat output
  notify: (message: string) => void // transient status line above the composer (auto-dismisses)
  requestMeta: () => Record<string, unknown> // current per-turn extras (e.g. the selected {model})
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
  const [composerActions, setComposerActions] = createSignal<ComposerActionDef[]>([])
  const composerControls: ComposerControlDef[] = []
  let dispose: (() => void) | undefined
  return {
    registerPanel(def) {
      panels.push(def)
    },
    registerComposerAction(def) {
      // Upsert by id so a re-applied extension (HMR) replaces its button instead of duplicating it.
      setComposerActions((prev) =>
        prev.some((a) => a.id === def.id) ? prev.map((a) => (a.id === def.id ? def : a)) : [...prev, def],
      )
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
  // One layer is visible at a time, so opening the quick terminal closes the modal and vice versa.
  const [layer, setLayer] = createSignal<'modal' | 'quick' | null>(null)
  const setQuickOpen = (v: boolean) => setLayer((prev) => (v ? 'quick' : prev === 'quick' ? null : prev))
  const closeModal = () => setLayer((prev) => (prev === 'modal' ? null : prev))

  // ONE shell-level live region pair, outside any pane (never inside an inert/closed qt sheet), so
  // session switch/error announcements are reliably read. Passed down as `announce`.
  const [politeMsg, setPoliteMsg] = createSignal('')
  const [assertiveMsg, setAssertiveMsg] = createSignal('')
  const announce = (msg: string, assertive = false) => (assertive ? setAssertiveMsg(msg) : setPoliteMsg(msg))

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
              announce={announce}
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
              open={() => layer() === 'quick'}
              setOpen={setQuickOpen}
            />
          </Show>
          <div class="sr-only" role="status" aria-live="polite">
            {politeMsg()}
          </div>
          <div class="sr-only" role="alert" aria-live="assertive">
            {assertiveMsg()}
          </div>
          {/* While picking, the open surface goes click-through+invisible; this pill is the only chrome. */}
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

// One mounted session view in the modal (its own ChatPanel + working/usage signals), keyed by our id.
type ModalPane = {id: SessionId; content: JSX.Element; working: () => boolean; usage: () => UsageSnapshot | null}

// Focusable controls inside the open dialog, in DOM order — used to wrap Tab focus. Skips controls in
// a hidden (inactive) session pane so the trap only spans the visible pane + chrome.
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute('disabled') && !el.closest('[data-pw-modal-hidden]'))
}

// FAB + panel carry `data-pw-fab` / `data-pw-panel` hooks (the shared-state `[data-pw-*]
// [data-pw-picking]` compound + PiP rules match on them). The mascot layers (pw-fab-rig / pw-rig-*)
// stay in CSS (embedded base64 PNGs). Everything else here is utilities.
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
  'fixed w-95 max-w-[calc(100vw-2.5rem)] h-140 max-h-[calc(100vh-7.5rem)] flex flex-col bg-pw-glass border border-pw-line-soft rounded-pw-lg shadow-pw-lg text-pw-text font-normal text-[0.875rem] leading-[1.45] font-pw overflow-hidden'
const PANEL_CLOSED = 'opacity-0 [transform:scale(0.96)_translateY(0.5rem)] pointer-events-none invisible trans-pop-out'
const PANEL_OPEN = 'opacity-100 [transform:none] pointer-events-auto visible trans-pop-in'

// Resize separators (thin, transparent; accent-lit on keyboard focus). Head chrome + close buttons.
const RESIZE = 'absolute z-[3] focus-visible:outline-none focus-visible:bg-pw-accent-20 focus-visible:ring-inset-accent'
const RESIZE_Y = 'left-0 right-0 h-2 cursor-ns-resize'
const RESIZE_X = 'top-0 bottom-0 w-2 cursor-ew-resize'
const HEAD = 'flex items-center gap-2.5 py-3 px-3.5 border-b border-b-pw-line-soft'
// Shared ghost icon button (modal close + quick-terminal header pip/split/close): bare at rest,
// fill + brighten on hover. Exported so quick-terminal reuses the exact same treatment.
export const CLOSE =
  'bg-transparent [border:none] text-pw-text-2 text-[1.375rem] cursor-pointer inline-flex items-center justify-center size-9.5 rounded-[0.5625rem] trans-color-bg hover:text-pw-text hover:bg-pw-fill-strong'
// Display is toggled (flex when active, hidden otherwise) so the two never collide on `display`.
const MODAL_PANE = 'flex-col flex-[1_1_auto] min-h-0'

function panelClass(open: boolean, position: TriggerPosition): string {
  return `${PANEL_BASE} ${PANEL_POS[position]} ${open ? PANEL_OPEN : PANEL_CLOSED}`
}

function fabClass(pulsing: boolean, position: TriggerPosition, dragging: boolean): string {
  return `${FAB_BASE} ${FAB_POS[position]}${pulsing ? ` ${FAB_ATTN}` : ''}${dragging ? ` ${FAB_DRAGGING}` : ''}`
}

// Corner-modal layout: the FAB (configurable position, drag-to-reposition) and the floating panel
// wrapping a panel's content. The content stays mounted across open/close so chat state persists
// and the FAB can pulse while the agent works with the panel closed.
function ModalLayout(props: {
  panel: PanelDef
  composerActions: () => ComposerActionDef[]
  composerControls: () => ComposerControlDef[]
  position: TriggerPosition
  announce: (msg: string, assertive?: boolean) => void
  open: () => boolean
  onOpen: () => void
  onClose: () => void
}): JSX.Element {
  // One ChatPanel per visited session, all mounted (so a background turn keeps streaming + persists),
  // the active one shown. Switching is a pure view swap — it never tears down or kills a turn.
  const [activeId, setActiveId] = createSignal<SessionId | null>(null)
  const [panes, setPanes] = createSignal<ModalPane[]>([])
  createEffect(() => writeStorage('mandarax-active-session', activeId()))
  const apiBase = props.panel.apiBase ?? ''

  const mountPane = (id: SessionId) => {
    if (panes().some((p) => p.id === id)) return
    const client = defineClient({apiBase})
    client.setSessionId(id)
    const [working, setWorking] = createSignal(false)
    const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
    const content = props.panel.create({
      active: () => props.open() && activeId() === id,
      onWorkingChange: setWorking,
      onUsageChange: setUsage,
      onSessionLabel: (name) => mergeSurface(id, makeSurfaceRow(id, name)),
      client,
      onNewSession: () => void activateNew(),
      announce: props.announce,
      composerActions: props.composerActions,
      composerControls: props.composerControls,
    })
    setPanes((prev) => [...prev, {id, content, working, usage}])
  }
  // Make a session active, mounting its pane on first visit.
  const activate = (id: SessionId) => {
    mountPane(id)
    setActiveId(id)
  }
  // New session: resolve a fresh id, then open + activate its pane.
  const activateNew = async () => {
    const {sessionId} = await defineClient({apiBase}).resolve()
    activate(sessionId)
  }
  // Seed: restore the persisted active session, else resolve a fresh one up front.
  const restored = readStorage('mandarax-active-session', parseActiveId, undefined)
  if (restored) activate(restored)
  else void activateNew()

  // The chrome (FAB pulse, context tracker, selector busy) reflects the ACTIVE pane.
  const activePane = () => panes().find((p) => p.id === activeId())
  const working = () => activePane()?.working() ?? false
  const usage = () => activePane()?.usage() ?? null

  const fab = createDraggablePosition({initial: props.position, storageKey: 'mandarax-fab-position'})
  const pip = createPiP()
  let fabEl: HTMLButtonElement | undefined
  let panelEl: HTMLElement | undefined

  const fabPulsing = () => !props.open() && working()

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
    storageKey: 'mandarax-modal-height',
    grow: () => (anchoredBottom() ? 'up' : 'down'),
    onCollapse: () => closePanel(),
  })
  const resizeX = createResizable({
    initial: 380,
    min: 300,
    storageKey: 'mandarax-modal-width',
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
        data-pw-panel
        data-pw-picking={picking() ? '' : undefined}
        style={{height: `${resizeY.size()}px`, width: `${resizeX.size()}px`}}
        role="dialog"
        aria-label="mandarax chat agent"
        aria-hidden={!props.open()}
        id="pw-chat-panel"
        onKeyDown={onPanelKeyDown}
      >
        <div
          class={`${RESIZE}  ${RESIZE_Y}  ${anchoredBottom() ? 'top-0' : 'bottom-0'}`}
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
          class={`${RESIZE}  ${RESIZE_X}  ${anchoredRight() ? 'left-0' : 'right-0'}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat width"
          aria-valuemin={300}
          aria-valuenow={Math.round(resizeX.size())}
          tabindex={0}
          onPointerDown={resizeX.onPointerDown}
          onKeyDown={resizeX.onKeyDown}
        />
        <header class={HEAD}>
          <button
            type="button"
            class={CLOSE}
            aria-label="Pop out to a window"
            title="Picture-in-Picture"
            onClick={() => panelEl && pip.open(panelEl, {title: props.panel.title})}
          >
            <PictureInPicture2 class="size-5 block" aria-hidden="true" />
          </button>
          <span class="tracking-[-0.01em] font-semibold">{props.panel.title}</span>
          <SessionSelector
            variant="pill"
            apiBase={props.panel.apiBase ?? ''}
            activeId={activeId}
            onActivate={activate}
            lockedElsewhere={(id) => (sessions().find((s) => s.id === id)?.running ?? false) && id !== activeId()}
            announce={props.announce}
          />
          <ContextTracker usage={usage()} />
          <button type="button" class={`${CLOSE} ml-auto`} aria-label="Close chat" onClick={closePanel}>
            <ChevronDown class="size-[1em] block" aria-hidden="true" />
          </button>
        </header>
        {/* Every visited session stays mounted (background turns keep streaming); only the active shows. */}
        <For each={panes()}>
          {(p) => (
            <div
              class={MODAL_PANE}
              classList={{flex: activeId() === p.id, hidden: activeId() !== p.id}}
              data-pw-modal-hidden={activeId() !== p.id ? '' : undefined}
            >
              {p.content}
            </div>
          )}
        </For>
      </section>
      <button
        type="button"
        ref={(el) => {
          fabEl = el
        }}
        class={fabClass(fabPulsing(), fab.position(), fab.dragging())}
        data-pw-fab
        data-pw-picking={picking() ? '' : undefined}
        style={fab.dragStyle()}
        aria-label={props.open() ? 'Minimize mandarax chat' : 'Open mandarax chat'}
        aria-expanded={props.open()}
        aria-controls="pw-chat-panel"
        onPointerDown={fab.onPointerDown}
        onClick={() => {
          if (!fab.consumeClick()) toggle()
        }}
      >
        {/* Rigged mascot: GSAP animates head/eyes/antenna as parts on open/close + while working. */}
        <FabRobot open={() => props.open()} working={working} />
      </button>
    </>
  )
}
