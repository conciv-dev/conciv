import type {JSX} from 'solid-js'
import type {IconName} from './icon-name.js'
import {Registry} from './core.js'
import type {ComposerNote, SessionRef, MountedSession, SessionScreen} from './host-apis.js'

export type {IconName}

export interface Command {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly keywords?: string
  readonly group?: string
  readonly section?: 'general' | 'session' | 'navigation' | 'model' | 'terminal' | 'prompt'
  readonly bind?: string
  readonly slash?: {
    readonly name: string
    readonly arguments?: true
    readonly after?: string
  }
  readonly hidden?: true
  readonly suggested?: boolean
  readonly featured?: true
  readonly enabled?: boolean
  readonly scope?: string
  readonly editable?: true
  /**
   * Runs the command from the keybind or the slash command. From the keybind, return `false` synchronously to decline
   * the key: the event goes on to its target, as if the command had no keybind, e.g. Enter reaches the prompt. `false`
   * from a slash command does nothing more.
   *
   * @param input - The slash command's arguments, when `slash.arguments` is set.
   * @returns `false` to decline the key; anything else handles it.
   *
   * @example
   * ```ts
   * run: () => (ctx.screen.current() ? keepGoing() : false)
   * ```
   */
  run(input?: string): void | false | Promise<void>
}

export interface PanelTab {
  readonly id: string
  readonly title: string
  readonly label?: (state: {
    readonly active: boolean
    readonly preview: boolean
    readonly session: MountedSession
  }) => JSX.Element
  readonly pinned?: boolean
  readonly draggable?: boolean
  readonly closable?: 'compact' | 'hover' | false
  readonly transient?: boolean
  readonly fallback?: boolean
  readonly group?: string
  readonly missing?: boolean
  readonly hidden?: boolean
  readonly file?: string
  readonly tabbable?: boolean
}

export interface PanelProps {
  readonly tab: PanelTab
  readonly session: MountedSession
  readonly screen: SessionScreen
}

export type ClosedPanelTab = {
  readonly title?: string
  readonly icon?: IconName
  readonly detail?: string
  readonly data?: string
}

export interface MobileView {
  readonly title: string
  readonly order: number
  readonly kind: 'tab' | 'menu' | 'drawer'
  readonly icon?: IconName
  readonly cached?: boolean
}

export interface Panel {
  readonly id: string
  readonly region: 'pane'
  readonly transient?: boolean
  /**
   * The canonical form of one of this panel's stored tab ids, when one tab can be stored more than one way (e.g.
   * the same file as an absolute and a relative path). The host rewrites stored ids and drops duplicates. Reactive.
   *
   * @param input - The stored id, session getter and constant owning screen. Do not destructure the session.
   */
  normalize?(input: {readonly id: string; readonly session: MountedSession; readonly screen: SessionScreen}): string
  readonly mobile?: MobileView
  /**
   * Reactive, and runs again when another session is routed. `open` holds this plugin's tab ids stored in the
   * strip. List those that still apply, plus any `pinned` tab. The host renders triggers, restore, and selection from
   * this data. Cache tab objects by something that outlives one session object (the tab id, `session.key`, or the
   * screen passed as `input.screen`), so a session switch does not render their labels again. Read the getters;
   * do not destructure.
   *
   * @param input - A session getter, the constant owning screen and this call's stored tab ids.
   */
  list(input: {
    readonly session: MountedSession
    readonly screen: SessionScreen
    readonly open: readonly string[]
  }): readonly PanelTab[]
  /**
   * Renders a tab's content once; its own reactivity updates it, also when another session is routed. A render that
   * throws renders nothing and records the error.
   *
   * @param props - The tab and session as reactive getters, and the constant owning screen.
   */
  render(props: PanelProps): JSX.Element
  /**
   * Runs after the host removes the tab from the strip.
   *
   * @param input - The removed tab, routed session and owning screen. Read the getters; do not destructure.
   */
  close?(input: PanelProps): void
  /**
   * Read as the user closes a tab, so it can come back. Return how the entry reads and the data `restore` needs, or
   * `false` when the tab cannot come back. Without it, a tab that is not `transient` comes back under the same key.
   * The host stores the entry, so keep `data` small.
   *
   * @param input - The closing tab, routed session and owning screen. Capture what reopening needs now.
   */
  closed?(input: PanelProps): ClosedPanelTab | false | undefined
  /**
   * Brings back a tab `closed` listed. Without it, the host opens the same key again.
   *
   * @param input - The routed session, owning screen, the closed tab's id and the `data` `closed` returned.
   */
  restore?(input: {
    readonly session: MountedSession
    readonly screen: SessionScreen
    readonly id: string
    readonly data?: string
  }): void
  /**
   * Runs when the tab becomes selected. `restored` is true for the selection the pane mounts with, e.g. the tab
   * selected before a reload, and false for every later selection change.
   *
   * @param input - The selected tab, routed session, owning screen and selection origin. Do not destructure.
   */
  focus?(
    input: PanelProps & {
      readonly restored: boolean
    },
  ): void
}

export interface SettingEntry {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly keywords?: string
}

export interface SettingsPage {
  readonly id: string
  readonly page?: 'general'
  readonly section?: 'general'
  readonly title: string
  readonly icon?: IconName
  readonly entries?: readonly SettingEntry[]
  /**
   * Renders the page, section or rows: `Ui.SettingsLayout` frames a page, `Ui.SettingsSection` a section, and
   * `Ui.SettingsRow` is one row, each as the app's own settings render them.
   *
   * @param input - `target` is the entry search is revealing.
   */
  render(input: {readonly target?: string}): JSX.Element
}

export type ServerState = 'stopped' | 'starting' | 'auth' | 'ready' | 'failed' | 'incompatible'

export interface ServerEntry {
  readonly id: string
  readonly name: string
  /**
   * @remarks Not implemented yet. Always undefined in this version.
   *
   * Short badge after the name, e.g. "SSH".
   */
  readonly label?: string
  readonly state: ServerState
  /**
   * @remarks Not implemented yet. Always undefined in this version.
   *
   * False keeps the entry out of the app's server list.
   */
  readonly listed?: boolean
  readonly http?: {
    readonly url: string
    /**
     * @remarks Not implemented yet. Always undefined in this version.
     *
     * The HTTP basic password.
     */
    readonly password?: string
  }
  /**
   * Resolves the endpoint again after the connection drops, e.g. a tunnel. Such a server is managed:
   * the host probes every new endpoint and holds prompts until the event connection is up.
   *
   * @param signal - Aborts when the host stops waiting.
   */
  reconnect?(signal: AbortSignal): Promise<{
    readonly url: string
    /**
     * @remarks Not implemented yet. Always undefined in this version.
     *
     * The new HTTP basic password.
     */
    readonly password?: string
  }>
  /**
   * @remarks Not implemented yet. Always undefined in this version.
   *
   * Called before opening a server that is not ready. Resolves true once it is.
   */
  connect?(): Promise<boolean>
  /**
   * @remarks Not implemented yet. Always undefined in this version.
   *
   * Runs before the host forgets the server.
   */
  remove?(): Promise<void>
  /**
   * Covers the routed session or draft while the entry is not ready; the route stays mounted underneath.
   * `tab` identifies the routed tab and changes when another one is routed.
   *
   * @param input - The routed tab.
   */
  cover?(input: {
    /**
     * @remarks Not implemented yet. Always undefined in this version.
     *
     * The routed tab's key.
     */
    readonly tab: string | undefined
  }): JSX.Element
}

export interface Server {
  readonly ready: boolean
  /**
   * @remarks Not implemented yet. Always undefined in this version.
   *
   * Sources list in ascending order. Defaults to 0.
   */
  readonly order?: number
  readonly entries: readonly ServerEntry[]
}

export interface Link {
  readonly href: string
  readonly origin?: string
  readonly exact?: boolean
  readonly background?: boolean
  readonly base?: string
  readonly session?: SessionRef
}

export interface LinkHandler {
  readonly priority?: number
  /**
   * Whether this handler opens the link.
   *
   * @param link - The link to route.
   */
  match(link: Link): boolean
  /**
   * Opens the link.
   *
   * @param link - A link `match` accepted.
   */
  open(link: Link): void
  /**
   * Whether the link's target exists. Omit it and `Links.exists` answers false, so text never looks like a link this
   * handler opens. Must never read file contents or show an error: it runs for every candidate path a message renders.
   * Resolve false on failure.
   *
   * @param link - A link `match` accepted.
   * @returns Whether the target exists, now or once checked.
   */
  exists?(link: Link): boolean | Promise<boolean>
}

export type ComposerPillTone = 'success' | 'warning' | 'danger'

export interface ComposerPillProps {
  readonly session: MountedSession
  readonly screen: SessionScreen
}

export interface ComposerPillRow {
  readonly id: string
  readonly label: string
  readonly icon?: IconName
  readonly tone?: ComposerPillTone
  readonly detail?: string
  run?(): void
}

export interface ComposerPillMenuProps extends ComposerPillProps {
  close(): void
}

export interface ComposerPillView {
  readonly label: string
  readonly icon?: IconName
  readonly tone?: ComposerPillTone
  readonly title?: string
  readonly rows?: readonly ComposerPillRow[]
  run?(): void
}

export interface ComposerPill {
  readonly id: string
  readonly order?: number
  /**
   * The pill above one session's composer, or undefined to show none there. Reactive: the host runs it for each
   * mounted composer and again when what it reads changes, so read the session's state and your own here.
   *
   * @param input - The session and its screen. Do not destructure.
   */
  show(input: ComposerPillProps): ComposerPillView | undefined
  /**
   * Your content for the popover the pill opens, for a pill that needs more than `rows`, such as status text and
   * buttons. The host owns the capsule and the popover around this content: its placement, focus, dismissal, and the
   * heading (`title`, else `label`). When set, clicking the pill opens the popover, and the view's `rows` and `run` are
   * unused. Renders each time the popover opens; its own reactivity updates it while open, also when another session is
   * routed. A render that throws renders nothing and records the error.
   *
   * @param input - The session, its screen, and `close`. Do not destructure.
   */
  menu?(input: ComposerPillMenuProps): JSX.Element
}

export interface CodeBlockProps {
  readonly code: string
  readonly language: string
  readonly session?: MountedSession
}

export interface CodeBlock {
  readonly languages: readonly string[]
  /**
   * Renders one block once, under your plugin's context; its own reactivity updates it, also when another session is
   * routed. Return `undefined` or `null` to keep the highlighted code, e.g. for a source you cannot parse. A render that
   * throws records the error under your plugin and the block shows its code; the plugin keeps running. The host
   * renders it again only when the block or the set of contributions changes.
   *
   * @param props - The block and its session. Do not destructure.
   * @returns Your UI for the block, or `undefined` or `null` to keep the code.
   */
  render(props: CodeBlockProps): JSX.Element | undefined
}

export interface CodeBlockAction {
  readonly id: string
  readonly languages: readonly string[]
  readonly icon: IconName
  readonly title: string
  readonly order?: number
  /**
   * Runs when the user clicks the button. A throw or a rejection is logged under your plugin and changes nothing else.
   *
   * @param input - The clicked block and its session. Do not destructure.
   */
  run(input: CodeBlockProps): void | Promise<void>
}

export interface NoteCardProps {
  readonly note: ComposerNote
  readonly session?: MountedSession
}

export interface NoteCard {
  readonly origins: readonly string[]
  /**
   * Renders one note once, under your plugin's context; its own reactivity updates it, also when another session is
   * routed. Return `undefined` or `null` to keep the host's note chip, e.g. for a note you cannot show. A render that
   * throws records the error under your plugin and the note shows its chip; the plugin keeps running. The host
   * renders it again only when the note or the set of contributions changes.
   *
   * @param props - The note and its session. Do not destructure.
   * @returns Your UI for the note, or `undefined` or `null` to keep the chip.
   */
  render(props: NoteCardProps): JSX.Element | undefined
}

export interface SlotMap {
  readonly 'window.bottom': Record<string, never>
  readonly 'session.header': {
    readonly screen: SessionScreen
    readonly session: MountedSession
    readonly active: boolean
    readonly compact: boolean
  }
  readonly 'session.status': {
    readonly screen: SessionScreen
    readonly session: MountedSession
  }
  readonly 'page.overlay': Record<string, never>
}

export type Slot = {
  [At in keyof SlotMap]: {
    readonly at: At
    readonly order?: number
    /**
     * Renders the content once; its own reactivity updates it. Session and active fields are reactive getters, so read
     * `input.session` where you use it: another routed session arrives through it without a remount. `screen` on a
     * session slot is its constant owning screen, available during the first render. A render that
     * throws renders nothing and records the error.
     *
     * @param input - The slot's input.
     */
    render(input: SlotMap[At]): JSX.Element
  } & SlotExtras[At]
}[keyof SlotMap]

interface SlotExtras {
  readonly 'window.bottom': unknown
  readonly 'session.header': unknown
  readonly 'session.status': unknown
  readonly 'page.overlay': {
    readonly hides?: boolean
  }
}

/**
 * The registry of commands, each with an optional keybind and slash command.
 *
 * @example
 * ```ts
 * ctx.add(Command, { id: "toggle", bind: "mod+shift+e", title: "Toggle", run: () => toggle() })
 * ```
 */
export const Command = Registry.define<Command>('command')

/**
 * The registry of panels: tabs in the pane's status bar.
 *
 * @example
 * ```ts
 * ctx.add(Panel, {
 *   id: "main",
 *   region: "pane",
 *   list: (input) => (input.open.includes("main") ? [tab] : []),
 *   render: (props) => <View session={props.session} />,
 * })
 * ```
 */
export const Panel = Registry.define<Panel>('panel')

/**
 * The registry of settings pages, sections on host pages, and rows in host sections.
 *
 * @example
 * ```ts
 * ctx.add(SettingsPage, { id: "updates", page: "general", title: "Updates", render: () => <Section /> })
 * ```
 */
export const SettingsPage = Registry.define<SettingsPage>('settings-page')

/**
 * The registry of server sources the app lists.
 *
 * @example
 * ```ts
 * ctx.add(Server, () => ({ ready: probed(), entries: [{ id: "local", name: "Local", state: "ready", http: { url } }] }))
 * ```
 */
export const Server = Registry.define<Server>('server')

/**
 * The registry of handlers that open local links, such as file paths in messages.
 *
 * @example
 * ```ts
 * ctx.add(LinkHandler, { match: (link) => link.href.endsWith(".md"), open: (link) => preview(link) })
 * ```
 */
export const LinkHandler = Registry.define<LinkHandler>('link-handler')

/**
 * The registry of pills above the session composer.
 *
 * @example
 * ```ts
 * ctx.add(ComposerPill, {
 *   id: "pulls",
 *   show: (input) => {
 *     const pulls = openPulls(input.session.directory)
 *     return pulls.length > 0 ? { icon: "link", label: `${pulls.length} pulls` } : undefined
 *   },
 * })
 * ```
 */
export const ComposerPill = Registry.define<ComposerPill>('composer-pill')

/**
 * The registry of renderers for fenced code blocks, by language.
 *
 * @example
 * ```tsx
 * ctx.add(CodeBlock, {
 *   languages: ["csv"],
 *   render: (props) => {
 *     const rows = parseCsv(props.code)
 *
 *     return rows ? <CsvTable rows={rows} /> : undefined
 *   },
 * })
 * ```
 */
export const CodeBlock = Registry.define<CodeBlock>('code-block')

/**
 * The registry of buttons beside a fenced code block's Copy button, by language.
 *
 * @example
 * ```ts
 * ctx.add(CodeBlockAction, {
 *   id: "run",
 *   languages: ["sh", "bash", "shell"],
 *   icon: "terminal",
 *   title: "Run",
 *   run: (input) => runInTerminal(input.code, input.session),
 * })
 * ```
 */
export const CodeBlockAction = Registry.define<CodeBlockAction>('code-block-action')

/**
 * The registry of renderers for the inside of composer notes, by origin.
 *
 * @example
 * ```tsx
 * ctx.add(NoteCard, {
 *   origins: ["recorder"],
 *   render: (props) => {
 *     const recording = findRecording(props.note.href)
 *
 *     return recording ? <Player recording={recording} /> : undefined
 *   },
 * })
 * ```
 */
export const NoteCard = Registry.define<NoteCard>('note-card')

/**
 * The registry of content for the host's slots (`SlotMap`).
 *
 * @example
 * ```ts
 * ctx.add(Slot, { at: "session.header", render: (input) => <Usage session={input.session} /> })
 * ```
 */
export const Slot = Registry.define<Slot>('slot')
