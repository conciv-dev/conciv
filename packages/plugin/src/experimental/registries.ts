import type {JSX} from 'solid-js'
import type {IconName} from './icon-name.js'
import {Registry} from './core.js'
import type {ComposerNote, SessionRef, MountedSession, SessionScreen} from './host-apis.js'

/** The name of a shared icon, from the app's icon catalog. */
export type {IconName}

/**
 * A command, with an optional keybind and slash command. The host publishes it as `${plugin}.${id}`. Read the title
 * from a getter so it follows reactive state.
 */
export interface Command {
  /** Local id. The host publishes `${plugin}.${id}`, e.g. terminal + toggle = terminal.toggle. */
  readonly id: string
  /** The command's label. */
  readonly title: string
  /** The label's second line. */
  readonly description?: string
  /** Extra words a search matches, separated by spaces. */
  readonly keywords?: string
  /** The category the command is listed under. */
  readonly group?: string
  /**
   * Section of Settings > Shortcuts that lists the command. Defaults to `general`.
   * - `general`: app-wide commands.
   * - `session`: commands on the current session.
   * - `navigation`: moving between views and tabs.
   * - `model`: model and agent choice.
   * - `terminal`: the terminal.
   * - `prompt`: the composer.
   */
  readonly section?: 'general' | 'session' | 'navigation' | 'model' | 'terminal' | 'prompt'
  /** The default keybind, e.g. `mod+shift+t`. The user can change it in Settings > Shortcuts. */
  readonly bind?: string
  /** Also offers the command as a composer slash command. */
  readonly slash?: {
    /** The name after the slash, e.g. `open` for `/open`. */
    readonly name: string
    /** The text after the name is passed to `run`. */
    readonly arguments?: true
    /** Lists this entry right after the slash entry with this name, e.g. "open", when one is present. */
    readonly after?: string
  }
  /** Keep out of command lists; the keybind still works. */
  readonly hidden?: true
  /** Also listed under the Suggested category while it is enabled. */
  readonly suggested?: boolean
  /** Listed when a command list opens without a query. */
  readonly featured?: true
  /** False takes the command out of command lists and turns its keybind off. Defaults to true. Reactive. */
  readonly enabled?: boolean
  /** CSS selector the keyboard focus must be inside for the binding to apply. Host tab shortcuts yield inside it. */
  readonly scope?: string
  /**
   * The binding also fires while a text field has focus. Without it, a binding with no Ctrl, Cmd or Alt key yields to
   * the text field.
   */
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

/**
 * A tab a `Panel` lists in the pane's status bar. Return the same object while it is unchanged, also across a session
 * switch where the tab stays: a new object renders its `label` again.
 */
export interface PanelTab {
  /** Host key is `${plugin}:${id}`. */
  readonly id: string
  /** Accessible name. Also the trigger content when `label` is absent. */
  readonly title: string
  /**
   * Renders the trigger content once per label function; `state` is reactive. `active`: the tab is selected;
   * `preview`: it is the host's replaceable preview tab; `session`: the routed session.
   */
  readonly label?: (state: {
    /** The tab is selected. */
    readonly active: boolean
    /** The tab is the preview tab. */
    readonly preview: boolean
    /** The routed session the strip shows; a new object when another session is routed. */
    readonly session: MountedSession
  }) => JSX.Element
  /** Listed without being opened, before every other tab, never closed or dragged. */
  readonly pinned?: boolean
  /** The user can drag the tab to reorder it. Defaults to true. */
  readonly draggable?: boolean
  /**
   * The close button; only how it looks. Defaults to a plain one.
   * - `compact`: a compact close button.
   * - `hover`: shows on hover or while selected.
   * - `false`: none.
   */
  readonly closable?: 'compact' | 'hover' | false
  /**
   * A launcher, a tab that opens others (e.g. "Open file"): the next preview replaces it. Independent of `closable`.
   * Unlike `Panel.transient`, the tab is restored.
   */
  readonly transient?: boolean
  /** Opts into fallback selection: the first eligible regular tab, then a pinned tab. Defaults to false. */
  readonly fallback?: boolean
  /** Tabs in one group share one render that stays mounted while any member is listed. */
  readonly group?: string
  /** Struck through, e.g. a file that no longer exists. */
  readonly missing?: boolean
  /**
   * Listed and selectable, but not drawn in the strip; for a restored tab whose content is not known yet. Selection,
   * `focus`, and closing the selected tab still apply to it.
   */
  readonly hidden?: boolean
  /** The workspace path of the file the tab shows. */
  readonly file?: string
  /** The tab panel itself joins the tab order, for content without focusable elements. */
  readonly tabbable?: boolean
}

/**
 * What `Panel.render` receives. `tab` and `session` are reactive getters; `screen` is the constant owning screen.
 * Read the getters where you use them and do not destructure. On a session switch the render stays mounted and
 * receives the next session. In `focus` and `close`, `tab` is the event's tab, not the render's changing selection.
 */
export interface PanelProps {
  /** The tab, as `list` currently returns it. */
  readonly tab: PanelTab
  /** The routed session. */
  readonly session: MountedSession
  /** The session screen that owns this panel's composer; always present. */
  readonly screen: SessionScreen
}

/** How a closed tab lists under "Recently closed", from `Panel.closed`. */
export type ClosedPanelTab = {
  /** The row's title; the tab's title by default. */
  readonly title?: string
  /** The row's icon; the panel's mobile icon by default. A tab with a `file` shows its file icon. */
  readonly icon?: IconName
  /** A muted detail after the title, e.g. a page's host. A tab with a `file` shows its folder. */
  readonly detail?: string
  /** What `restore` needs to bring the tab back, e.g. a URL. */
  readonly data?: string
}

/** A panel's narrow-screen view. */
export interface MobileView {
  /** The view's label in the switcher or the overflow menu. */
  readonly title: string
  /** Views list in ascending order. */
  readonly order: number
  /**
   * Where the view is offered.
   * - `tab`: a tab of the view switcher; it replaces the conversation.
   * - `menu`: an entry of the switcher's More drawer; it replaces the conversation.
   * - `drawer`: an entry of the switcher's More drawer; it opens in that drawer over the conversation (`useDrawer`).
   */
  readonly kind: 'tab' | 'menu' | 'drawer'
  /** The view's icon in the More drawer. */
  readonly icon?: IconName
  /**
   * Once shown, the view stays mounted while another view is shown, e.g. a terminal that keeps its shell's screen.
   * Defaults to false: the view mounts each time it is shown.
   */
  readonly cached?: boolean
}

/** A panel: the tabs a plugin shows in the pane's status bar; selecting one replaces the chat. */
export interface Panel {
  /** The panel's id, unique within the plugin. Its mobile view's key is `${plugin}:${id}`. */
  readonly id: string
  /**
   * Where the panel renders.
   * - `pane`: tabs in the pane's status bar; the selected tab replaces the chat.
   */
  readonly region: 'pane'
  /** Tabs are not restored: stored keys this panel stops listing leave the strip. See also `PanelTab.transient`. */
  readonly transient?: boolean
  /**
   * The canonical form of one of this panel's stored tab ids, when one tab can be stored more than one way (e.g.
   * the same file as an absolute and a relative path). The host rewrites stored ids and drops duplicates. Reactive.
   *
   * @param input - The stored id, session getter and constant owning screen. Do not destructure the session.
   */
  normalize?(input: {
    /** A stored tab id. */
    readonly id: string
    /** The routed session. */
    readonly session: MountedSession
    /** The session screen; always present. */
    readonly screen: SessionScreen
  }): string
  /**
   * A narrow-screen view of this panel. The render sees `usePanel().placement() === "mobile"` and receives a tab with
   * the panel's `id` and the view's `title`.
   */
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
    /** The routed session. */
    readonly session: MountedSession
    /** The session screen; always present. */
    readonly screen: SessionScreen
    /** This plugin's stored tab ids, in strip order. */
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
    /** The routed session the tab closed in. */
    readonly session: MountedSession
    /** The session screen that owns the panel. */
    readonly screen: SessionScreen
    /** The closed tab's id. */
    readonly id: string
    /** What `closed` returned as `data`. */
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
      /** The selection the pane mounted with, not a user's choice. */
      readonly restored: boolean
    },
  ): void
}

/** A search entry of a `SettingsPage`, indexed without mounting the page. */
export interface SettingEntry {
  /** The `data-action` of the row search reveals. An entry with the SettingsPage's own id describes the page itself. */
  readonly id: string
  /** The entry's title in search results. */
  readonly title: string
  /** The entry's second line. */
  readonly description?: string
  /** Extra words search matches, separated by spaces. */
  readonly keywords?: string
}

/** A settings page, a section on a host page, or rows in a host section. */
export interface SettingsPage {
  /** A page's settings id, and `Layout.settings`'s argument. */
  readonly id: string
  /**
   * Adds a section to a host page. Omit it to add a page.
   * - `general`: the General page.
   */
  readonly page?: 'general'
  /**
   * `general`: with `page: "general"`, adds rows to that page's General section instead of a section of its own:
   * `render` returns settings rows, which the host places in its list. Search lists the entries under the host
   * section.
   */
  readonly section?: 'general'
  /** Nav label of a page; search shows it as the section of every entry, except rows placed in a host `section`. */
  readonly title: string
  /** The page's nav icon. */
  readonly icon?: IconName
  /** Search metadata, indexed without mounting the page. */
  readonly entries?: readonly SettingEntry[]
  /**
   * Renders the page, section or rows: `Ui.SettingsLayout` frames a page, `Ui.SettingsSection` a section, and
   * `Ui.SettingsRow` is one row, each as the app's own settings render them.
   *
   * @param input - `target` is the entry search is revealing.
   */
  render(input: {
    /** The `SettingEntry.id` search is revealing, if any. */
    readonly target?: string
  }): JSX.Element
}

/**
 * Where a contributed server stands.
 * - `stopped`: not running.
 * - `starting`: starting up.
 * - `auth`: waiting for the user to sign in.
 * - `ready`: reachable; `http` holds its endpoint.
 * - `failed`: could not start.
 * - `incompatible`: running a version this app does not support.
 */
export type ServerState = 'stopped' | 'starting' | 'auth' | 'ready' | 'failed' | 'incompatible'

/** A server a plugin contributes through a `Server` source. */
export interface ServerEntry {
  /** The entry's id; its key is `${plugin}:${id}`. */
  readonly id: string
  /** The display name. */
  readonly name: string
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Short badge after the name, e.g. "SSH".
   */
  readonly label?: string
  /** Where the server stands. */
  readonly state: ServerState
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * False keeps the entry out of the app's server list.
   */
  readonly listed?: boolean
  /** The endpoint, once the server is `ready`. */
  readonly http?: {
    /** The base URL. */
    readonly url: string
    /**
     * Not implemented yet. Always undefined in this version.
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
    /** The new base URL. */
    readonly url: string
    /**
     * Not implemented yet. Always undefined in this version.
     *
     * The new HTTP basic password.
     */
    readonly password?: string
  }>
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Called before opening a server that is not ready. Resolves true once it is.
   */
  connect?(): Promise<boolean>
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Runs before the host forgets the server.
   */
  remove?(): Promise<void>
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Covers the routed session or draft while the entry is not ready; the route stays mounted underneath.
   * `tab` identifies the routed tab and changes when another one is routed.
   *
   * @param input - The routed tab.
   */
  cover?(input: {
    /** The routed tab's key. */
    readonly tab: string
  }): JSX.Element
}

/** A source of servers, e.g. an engine found on this machine or the engine of a native app. */
export interface Server {
  /**
   * Startup waits until every source is ready. A ready source's entries are its complete inventory: the host
   * forgets a server only when a ready source stops listing it.
   */
  readonly ready: boolean
  /**
   * Not implemented yet. Always undefined in this version.
   *
   * Sources list in ascending order. Defaults to 0.
   */
  readonly order?: number
  /** Keys are `${plugin}:${id}`. */
  readonly entries: readonly ServerEntry[]
}

/** A local link the app routes to a `LinkHandler`, e.g. a file path in a message. */
export interface Link {
  /** The link target: a path, URL or `file://` link. */
  readonly href: string
  /** The plugin that produced the linked item, e.g. the origin of a composer note. */
  readonly origin?: string
  /** The path is a known workspace file, not a guess from text. */
  readonly exact?: boolean
  /**
   * Must not switch the view: the agent opened it, or the user opened it from where they stay (e.g. a composer chip).
   * Handlers pass it to `Layout.open`.
   */
  readonly background?: boolean
  /** Workspace-relative directory the link was written in. */
  readonly base?: string
  /** The session the link belongs to. */
  readonly session?: SessionRef
}

/** Opens local links that `match` accepts. `Links.open` picks the matching handler with the highest priority. */
export interface LinkHandler {
  /** Handlers with higher values win; on a tie, the first contributed. Defaults to 0. */
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

/**
 * The status a composer pill or one of its rows shows, by coloring its icon.
 * - `success`: done or passing.
 * - `warning`: needs attention, such as checks still running or a review requested.
 * - `danger`: failed or blocked.
 */
export type ComposerPillTone = 'success' | 'warning' | 'danger'

/** What a composer pill receives: the session whose composer it sits above. Do not destructure. */
export interface ComposerPillProps {
  /** The routed session; a new object when another session is routed. Its fields are getters. */
  readonly session: MountedSession
  /** The session screen that owns the composer. */
  readonly screen: SessionScreen
}

/** One row of the menu a composer pill opens. */
export interface ComposerPillRow {
  /** The row's id, unique within the pill. */
  readonly id: string
  /** The row's text. */
  readonly label: string
  /** The row's icon. Omit it for none. */
  readonly icon?: IconName
  /** Colors the row's icon. */
  readonly tone?: ComposerPillTone
  /** Muted text at the row's end, such as a branch or a count. */
  readonly detail?: string
  /** Runs when the user picks the row. Omit it for a row that only shows. */
  run?(): void
}

/** What a composer pill's `menu` receives: the pill's session and a way to close the popover. Do not destructure. */
export interface ComposerPillMenuProps extends ComposerPillProps {
  /** Closes the popover, for example after the user picks an action in it. Does nothing once it is closed. */
  close(): void
}

/** What a composer pill shows above one session's composer. */
export interface ComposerPillView {
  /** The capsule's text; long text truncates. */
  readonly label: string
  /** The capsule's icon. Omit it for none. */
  readonly icon?: IconName
  /** Colors the capsule's icon. */
  readonly tone?: ComposerPillTone
  /**
   * Accessible name, and the heading of the menu or popover the pill opens, when it differs from `label`. The heading
   * wraps to at most three lines, then truncates.
   */
  readonly title?: string
  /** The menu the pill opens. Omit it for a pill that runs `run` instead. Unused when the pill has a `menu`. */
  readonly rows?: readonly ComposerPillRow[]
  /** Runs when the user clicks a pill without `rows` or a `menu`. */
  run?(): void
}

/**
 * A pill in the row above a session's composer. Pills float over the timeline, so showing or hiding one never resizes
 * the composer.
 */
export interface ComposerPill {
  /** The pill's id, unique within the plugin. */
  readonly id: string
  /** Sorts plugin pills, lowest first; ties keep contribution order. Defaults to 0. */
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

/**
 * One complete fenced code block, as a `CodeBlock` render and a `CodeBlockAction` receive it. Do not destructure:
 * `session` is a getter.
 */
export interface CodeBlockProps {
  /** The source between the fences, without the final line break. */
  readonly code: string
  /**
   * The fence's language: the first word of its info string, lowercased, without characters other than letters, digits
   * and `_ # + . -`. For ```` ```Mermaid title="Flow" ```` it is `mermaid`; empty for a fence without one.
   */
  readonly language: string
  /**
   * The routed session of the screen that shows the block; a new object when another session is routed. Undefined for
   * Markdown outside a session screen, where the host does not offer code block content today.
   */
  readonly session?: MountedSession
}

/**
 * Renders the fenced code blocks of some languages as your own UI in place of the highlighted code, for example a
 * diagram for ```` ```mermaid ```` or a table for ```` ```csv ````. Applies to Markdown on the session screen: the
 * timeline (assistant text and tool output), panels, and `ctx.ui.Markdown` rendered there. `ctx.ui.Code`, and
 * Markdown your own render shows, keep the plain code, so a render never meets itself.
 *
 * The host renders a block only once its closing fence arrives: while it streams, and in a message that stopped
 * mid-block, the user sees the highlighted code, then your UI replaces it in place. Blocks of other languages cost
 * nothing. The block keeps its Copy button and `CodeBlockAction` buttons over the top end corner of your UI, and its
 * height follows your UI as it grows; reserve the height you know (for example a minimum) so the timeline shifts less
 * when asynchronous content arrives.
 */
export interface CodeBlock {
  /**
   * The languages whose blocks you render, compared with `CodeBlockProps.language`, e.g. `["csv", "tsv"]`. The host
   * resolves no aliases: list each name you accept. When several contributions list a language, the first contributed
   * renders it.
   */
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

/**
 * A button beside the Copy button of the fenced code blocks of some languages, for example "Run in terminal" for
 * ```` ```sh ````. It shows where `CodeBlock` content shows, once the block's closing fence arrives, so it never acts on
 * half a block. Buttons reveal with Copy on hover or focus.
 */
export interface CodeBlockAction {
  /** The action's id, unique within the plugin. */
  readonly id: string
  /**
   * The languages whose blocks show the button, compared with `CodeBlockProps.language`, e.g. `["sh", "bash", "shell"]`.
   * The host resolves no aliases: list each name you accept.
   */
  readonly languages: readonly string[]
  /** The button's icon. */
  readonly icon: IconName
  /** The button's accessible name and tooltip. Read it from a getter so it follows reactive state. */
  readonly title: string
  /** Buttons list in ascending order, before Copy. Defaults to 0; ties keep contribution order. */
  readonly order?: number
  /**
   * Runs when the user clicks the button. A throw or a rejection is logged under your plugin and changes nothing else.
   *
   * @param input - The clicked block and its session. Do not destructure.
   */
  run(input: CodeBlockProps): void | Promise<void>
}

/**
 * One composer note, as a `NoteCard` render receives it. Do not destructure: `session` is a getter.
 */
export interface NoteCardProps {
  /** The note, as the plugin attached it through `composer.attach`. */
  readonly note: ComposerNote
  /**
   * The routed session of the screen that shows the note; a new object when another session is routed. Undefined
   * outside a session screen.
   */
  readonly session?: MountedSession
}

/**
 * Renders the inside of the composer notes some plugins attach as your own UI in place of the host's note chip, for
 * example a player for a recording. Applies to the note in the composer and in the sent message. The host keeps the
 * note's frame, its remove button and its placement around your UI; notes of other origins cost nothing.
 */
export interface NoteCard {
  /**
   * The origins whose notes you render, compared with `ComposerNote.origin`, e.g. `["recorder"]`. When several
   * contributions list an origin, the first contributed renders it.
   */
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

/** The places a `Slot` renders, with the input each passes to `render`. */
export interface SlotMap {
  /** Full-width strip at the bottom of the pane. */
  readonly 'window.bottom': Record<string, never>
  /** The pane's title row. Cached timelines stay mounted while hidden; `active` is false then. */
  readonly 'session.header': {
    /** The timeline's owning session screen; always present, also while the timeline is cached. */
    readonly screen: SessionScreen
    /** The timeline's session: its latest object, kept while the timeline is hidden. */
    readonly session: MountedSession
    /** The timeline is the one on screen. */
    readonly active: boolean
    /**
     * The title does not fit beside the actions. Show the compact form of what you render, without its details (for
     * example an icon that opens them in a menu), so the title keeps the room. The header returns to false once the
     * title fits beside your expanded content again.
     */
    readonly compact: boolean
  }
  /** The pane's status bar, above the composer, e.g. a build status chip. */
  readonly 'session.status': {
    /** The owning session screen; always present. */
    readonly screen: SessionScreen
    /** The routed session; a new object when another session is routed. */
    readonly session: MountedSession
  }
  /** The connect screen, shown while the widget has no engine bound. */
  readonly 'window.connect': {
    /** The origin of the page the widget runs in. */
    readonly origin: string
    /**
     * Binds the widget to the engine at `apiBase`, as the connect screen's own search does.
     *
     * @param apiBase - The engine's base URL.
     */
    readonly found: (apiBase: string) => void
  }
  /** Drawn over the user's page, outside the widget, e.g. a recording frame or a whiteboard. */
  readonly 'page.overlay': Record<string, never>
}

/** Content for one of the host's slots, typed by `at`. */
export type Slot = {
  [At in keyof SlotMap]: {
    /** The slot; see `SlotMap`. */
    readonly at: At
    /** Slot contents render in ascending order. Defaults to 0. */
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

/** Fields a `Slot` item carries only at some places, beyond the ones every place shares. */
interface SlotExtras {
  readonly 'window.bottom': unknown
  readonly 'session.header': unknown
  readonly 'session.status': unknown
  readonly 'window.connect': unknown
  readonly 'page.overlay': {
    /**
     * The conciv widget hides while this overlay is on screen. Defaults to false. Whether or not it hides, the host
     * steps back from the keyboard on its own whenever an overlay is up.
     */
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
